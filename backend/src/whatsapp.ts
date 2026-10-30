import type { Config } from "./config.js";
import type { OrderEvents } from "./events.js";
import { normalizePhone } from "./phone.js";
import type { OrderRec } from "./orderStore.js";

/** WhatsApp Business Cloud API (Meta). Business-initiated messages MUST be pre-approved templates. */
export interface WhatsAppProvider { readonly name: string; readonly configured: boolean; sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<void> }

export const noWhatsApp: WhatsAppProvider = { name: "none", configured: false, sendTemplate: async () => { throw new Error("WhatsApp is not configured"); } };

/** Template parameters may not contain new lines/tabs or long runs of spaces, and must not be empty. */
export const cleanParam = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200) || "-";

export class CloudWhatsApp implements WhatsAppProvider {
  readonly name = "cloud";
  constructor(private token: string, private phoneNumberId: string, private fetchFn: typeof fetch = fetch) {}
  get configured() { return !!this.token && !!this.phoneNumberId; }
  async sendTemplate(to: string, template: string, lang: string, params: string[]) {
    const r = await this.fetchFn(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template",
        template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: cleanParam(text) })) }] } }),
    });
    if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
}
export function createWhatsAppProvider(cfg: Pick<Config, "WHATSAPP_DRIVER" | "WHATSAPP_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID">): WhatsAppProvider {
  return cfg.WHATSAPP_DRIVER === "cloud" ? new CloudWhatsApp(cfg.WHATSAPP_TOKEN, cfg.WHATSAPP_PHONE_NUMBER_ID) : noWhatsApp;
}

export type WaKind = "welcome" | "order_confirmation";
export type WaStatus = "sending" | "sent" | "failed" | "skipped";
export interface WaLog { id: string; kind: WaKind; refId: string; toPhone: string; status: WaStatus; error: string | null; createdAt: Date }
export interface WhatsAppStore {
  /** Reserves (kind, refId). Returns null when it was already handled, so the same message is never sent twice. */
  claim(kind: WaKind, refId: string, toPhone: string): Promise<WaLog | null>;
  finish(id: string, status: WaStatus, error: string | null): Promise<void>;
  countRecentTo(toPhone: string, windowMs: number): Promise<number>;
  recent(limit: number): Promise<WaLog[]>;
}

export const MAX_WHATSAPP_PER_NUMBER_PER_HOUR = 5;
interface Logger { error(o: object, m: string): void }

/**
 * Sends the welcome message (new phone account) and the order confirmation. Both are best effort and NEVER throw:
 * a WhatsApp problem can not fail a sign-up or lose an order. Failures are recorded in whatsapp_logs for the admin to see.
 */
export class WhatsAppService implements OrderEvents {
  constructor(private d: { cfg: Pick<Config, "STORE_NAME" | "WHATSAPP_LANG" | "WHATSAPP_TPL_WELCOME" | "WHATSAPP_TPL_ORDER">; provider: WhatsAppProvider; store: WhatsAppStore; log?: Logger }) {}
  get configured() { return this.d.provider.configured; }
  get providerName() { return this.d.provider.name; }

  private async send(kind: WaKind, refId: string, rawPhone: string | null | undefined, template: string, params: string[]) {
    try {
      if (!this.configured) return;                       // not claimed on purpose: switching WhatsApp on later must not message old orders
      const to = rawPhone ? normalizePhone(rawPhone) : null; if (!to) return;
      const row = await this.d.store.claim(kind, refId, to); if (!row) return;
      // A customer can type any number at checkout, so cap what one number can receive per hour.
      if ((await this.d.store.countRecentTo(to, 3600_000)) > MAX_WHATSAPP_PER_NUMBER_PER_HOUR) { await this.d.store.finish(row.id, "skipped", "Too many messages to this number in the last hour"); return; }
      try { await this.d.provider.sendTemplate(to, template, this.d.cfg.WHATSAPP_LANG, params); await this.d.store.finish(row.id, "sent", null); }
      catch (e) { const m = String((e as Error).message ?? e).slice(0, 500); await this.d.store.finish(row.id, "failed", m); this.d.log?.error({ kind, err: m }, "whatsapp send failed"); }
    } catch (e) { this.d.log?.error({ kind, err: String(e) }, "whatsapp bookkeeping failed"); }
  }

  /** Template {{1}} = first name, {{2}} = store name. */
  welcome(u: { id: string; fullName: string; phone: string | null }) {
    return this.send("welcome", u.id, u.phone, this.d.cfg.WHATSAPP_TPL_WELCOME, [u.fullName.trim().split(/\s+/)[0] ?? "there", this.d.cfg.STORE_NAME]);
  }
  /** Template {{1}} = name, {{2}} = order number, {{3}} = store name, {{4}} = total (PKR), {{5}} = city. */
  async orderPlaced(o: OrderRec) {
    await this.send("order_confirmation", o.id, o.customer.phone, this.d.cfg.WHATSAPP_TPL_ORDER,
      [o.customer.name, o.orderNumber, this.d.cfg.STORE_NAME, o.total.toLocaleString("en-US"), o.address.city]);
  }
  async statusChanged() {}
  recent(limit: number) { return this.d.store.recent(limit); }
}
