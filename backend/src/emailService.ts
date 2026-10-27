import type { Config } from "./config.js";
import { EmailError, type EmailProvider } from "./emailProvider.js";
import { renderOrderConfirmation, renderOwnerNewOrder, renderStatusUpdate, renderTest, type Brand, type Rendered } from "./emailTemplates.js";
import { BACKOFF_MS, MAX_ATTEMPTS, type EmailKind, type EmailLog, type EmailStore } from "./emailStore.js";
import type { OrderEvents } from "./events.js";
import type { OrderStatus } from "./orderStatus.js";
import type { OrderRec, OrderStore } from "./orderStore.js";
import type { SettingsStore } from "./settingsStore.js";

/** Statuses that email the customer. (Intermediate steps stay quiet to avoid spamming.) */
export const CUSTOMER_EMAIL_STATUSES: OrderStatus[] = ["shipped", "delivered", "cancelled", "refunded"];
export const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 5;
const OWNER_ALERT_STATUSES: OrderStatus[] = ["cancelled", "refund_requested"];
const ALERT_HEADLINE: Partial<Record<OrderStatus, string>> = { cancelled: "Order cancelled", refund_requested: "Return requested" };

interface Logger { error(o: object, m: string): void; warn?(o: object, m: string): void }

/**
 * Outbox-based email. Orders are committed first; this class only ever reads orders and writes email_logs,
 * so an email problem can never lose or duplicate an order.
 */
export class EmailService implements OrderEvents {
  private running = false;
  constructor(private d: {
    cfg: Pick<Config, "EMAIL_FROM" | "ADMIN_PUBLIC_URL" | "PUBLIC_LOGO_URL" | "STORE_NAME" | "STORE_TIMEZONE">;
    provider: EmailProvider; emails: EmailStore; settings: SettingsStore; orders: OrderStore; log?: Logger; now?: () => Date;
  }) {}

  get configured() { return this.d.provider.configured; }
  get providerName() { return this.d.provider.name; }
  private now() { return this.d.now?.() ?? new Date(); }
  private brand(storeName: string): Brand { const c = this.d.cfg; return { storeName: storeName || c.STORE_NAME, logoUrl: c.PUBLIC_LOGO_URL, adminUrl: c.ADMIN_PUBLIC_URL, timezone: c.STORE_TIMEZONE }; }

  // ---- OrderEvents (called after the order transaction has committed) ----
  async orderPlaced(o: OrderRec) {
    const s = await this.d.settings.load();
    // Abuse guard: a customer can type any address at checkout, so cap how many emails one address can receive per hour.
    const flooded = (await this.d.emails.countRecentTo(o.customer.email, 3600_000)) >= MAX_EMAILS_PER_ADDRESS_PER_HOUR;
    await this.d.emails.enqueue({ orderId: o.id, kind: "order_confirmation", toEmail: o.customer.email, dedupeKey: `order_confirmation:${o.id}`,
      failedReason: flooded ? "Skipped: too many emails to this address in the last hour" : undefined });
    await this.d.emails.enqueue({ orderId: o.id, kind: "owner_new_order", toEmail: s.ownerEmail, dedupeKey: `owner_new_order:${o.id}`,
      failedReason: s.ownerEmail ? undefined : "Owner email is not set. Add it in Settings, then press Retry." });
    void this.processDue();                       // fire-and-forget; the timer and retries cover failures
  }
  async statusChanged(o: OrderRec, _prev: OrderStatus) {
    const key = `${o.id}:${o.status}:${o.history.length}`;
    if (CUSTOMER_EMAIL_STATUSES.includes(o.status)) await this.d.emails.enqueue({ orderId: o.id, kind: "status_update", toEmail: o.customer.email, dedupeKey: `status_update:${key}` });
    if (OWNER_ALERT_STATUSES.includes(o.status)) {
      const s = await this.d.settings.load();
      await this.d.emails.enqueue({ orderId: o.id, kind: "owner_status_alert", toEmail: s.ownerEmail, dedupeKey: `owner_status_alert:${key}`, failedReason: s.ownerEmail ? undefined : "Owner email is not set." });
    }
    void this.processDue();
  }

  private async render(row: EmailLog, o: OrderRec): Promise<{ r: Rendered; to: string }> {
    const s = await this.d.settings.load(); const b = this.brand(s.store.name);
    const owner = row.kind === "owner_new_order" || row.kind === "owner_status_alert";
    const to = owner ? s.ownerEmail : row.toEmail;                    // owner recipient is resolved at send time, so fixing Settings + Retry works
    if (!to) throw new EmailError("Owner email is not set. Add it in Settings, then press Retry.", true);
    const r = row.kind === "order_confirmation" ? renderOrderConfirmation(o, s, b)
      : row.kind === "status_update" ? renderStatusUpdate(o, s, b)
      : row.kind === "owner_new_order" ? renderOwnerNewOrder(o, s, b)
      : renderOwnerNewOrder(o, s, b, { headline: ALERT_HEADLINE[o.status] ?? "Order update" });
    return { r, to };
  }

  /** Sends everything that is due. Safe to call from a timer, a cron ping, or right after an order. */
  async processDue(limit = 10): Promise<{ sent: number; retrying: number; failed: number; skipped: boolean }> {
    const out = { sent: 0, retrying: 0, failed: 0, skipped: false };
    if (!this.d.provider.configured) return { ...out, skipped: true };      // rows stay queued; nothing is lost
    if (this.running) return { ...out, skipped: true };
    this.running = true;
    try {
      for (const row of await this.d.emails.claimDue(limit)) {
        try {
          const order = row.orderId ? await this.d.orders.adminGet(row.orderId) : null;
          if (!order) throw new EmailError("Order no longer exists", true);
          const { r, to } = await this.render(row, order);
          const s = await this.d.settings.load();
          const res = await this.d.provider.send({ to, from: this.d.cfg.EMAIL_FROM, replyTo: s.store.supportEmail || undefined, subject: r.subject, html: r.html, text: r.text, idempotencyKey: row.dedupeKey });
          await this.d.emails.markSent(row.id, res.messageId, r.subject); out.sent++;
        } catch (e) {
          const err = e instanceof EmailError ? e : new EmailError((e as Error).message, false);
          if (err.permanent || row.attempts >= MAX_ATTEMPTS) { await this.d.emails.markFailed(row.id, err.message); out.failed++; }
          else { await this.d.emails.markRetry(row.id, err.message, new Date(this.now().getTime() + (BACKOFF_MS[row.attempts - 1] ?? BACKOFF_MS.at(-1)!))); out.retrying++; }
          this.d.log?.error({ kind: row.kind, id: row.id, attempts: row.attempts, err: err.message }, "email send failed");
        }
      }
    } finally { this.running = false; }
    return out;
  }

  async retry(id: string) { const ok = await this.d.emails.retry(id); if (ok) void this.processDue(); return ok; }

  /** Direct send (not queued) so the owner gets immediate, honest feedback on their configuration. */
  async sendTest(to: string): Promise<{ ok: boolean; message: string }> {
    if (!this.d.provider.configured) return { ok: false, message: "No email provider is configured on the server (EMAIL_DRIVER)." };
    const s = await this.d.settings.load(); const r = renderTest(s, this.brand(s.store.name));
    try {
      await this.d.provider.send({ to, from: this.d.cfg.EMAIL_FROM, subject: r.subject, html: r.html, text: r.text, idempotencyKey: `test:${to}:${this.now().getTime()}` });
      return { ok: true, message: `The provider accepted the test email for ${to}. Check the inbox (and spam). Acceptance is not delivery.` };
    } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
}
export type { EmailKind };
