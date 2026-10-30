import type { OrderEvents } from "./events.js";
import type { OrderStatus } from "./orderStatus.js";
import type { OrderRec } from "./orderStore.js";
import { PushError, type PushMessage, type PushSender } from "./pushSender.js";
import type { CampaignRec, NotificationKind, PushStore } from "./pushStore.js";

interface Logger { error(o: object, m: string): void }
export const orderLink = (id: string) => `talhastudio://order/${id}`;

const ORDER_PUSH: Partial<Record<OrderStatus, (o: OrderRec) => { title: string; body: string }>> = {
  shipped: (o) => ({ title: "Your order is on its way", body: `Order ${o.orderNumber} has been shipped.` }),
  delivered: (o) => ({ title: "Order delivered", body: `Order ${o.orderNumber} was delivered. Thank you for shopping with us.` }),
  cancelled: (o) => ({ title: "Order cancelled", body: `Order ${o.orderNumber} was cancelled.` }),
  refunded: (o) => ({ title: "Refund processed", body: `Your refund for order ${o.orderNumber} has been processed.` }),
};

/**
 * Every order event creates an in-app inbox entry (works even without FCM) and, when the customer allows order updates and has
 * a registered device, a push. Push failures are logged and never affect the order.
 */
export class PushService implements OrderEvents {
  private pending = new Set<Promise<unknown>>();
  constructor(private d: { store: PushStore; sender: PushSender; log?: Logger }) {}
  get configured() { return this.d.sender.configured; }

  async orderPlaced(o: OrderRec) { await this.orderNote(o, { title: "Order confirmed", body: `Thank you! Order ${o.orderNumber} has been placed (Rs. ${o.total.toLocaleString("en-PK")}, Cash on Delivery).` }); }
  async statusChanged(o: OrderRec, _prev: OrderStatus) { const m = ORDER_PUSH[o.status]; if (m) await this.orderNote(o, m(o)); }

  private async orderNote(o: OrderRec, m: { title: string; body: string }) {
    if (!o.userId) return;
    try {
      const rec = await this.d.store.addNotification(o.userId, { ...m, deepLink: orderLink(o.id), kind: "order" });
      const prefs = await this.d.store.getPrefs(o.userId);
      if (!prefs.orderUpdates || !this.configured) return;
      await this.sendTo(await this.d.store.tokensForUser(o.userId), { ...m, deepLink: orderLink(o.id), kind: "order", notificationId: rec.id });
    } catch (e) { this.d.log?.error({ err: String(e), order: o.orderNumber }, "order notification failed"); }
  }

  /** A store reply in the customer chat: phone push only (the chat itself is the inbox). Best effort, never throws. */
  async chatReply(customerId: string, preview: string, deepLink: string) {
    try {
      if (!this.configured) return;
      const tokens = await this.d.store.tokensForUser(customerId);
      if (tokens.length) await this.sendTo(tokens, { title: "Talha Studio", body: preview.slice(0, 120), deepLink, kind: "promo" });
    } catch (e) { this.d.log?.error({ err: String(e) }, "chat push failed"); }
  }

  /** Sends to many tokens (bounded concurrency) and deletes tokens FCM reports as dead. Returns counts. */
  async sendTo(tokens: string[], m: PushMessage): Promise<{ sent: number; failed: number }> {
    const dead: string[] = []; let sent = 0, failed = 0; const queue = [...new Set(tokens)];
    const worker = async () => {
      for (let t = queue.pop(); t !== undefined; t = queue.pop()) {
        try { await this.d.sender.send(t, m); sent++; }
        catch (e) {
          failed++;
          if (e instanceof PushError && e.invalidToken) dead.push(t);
          else this.d.log?.error({ err: (e as Error).message }, "push send failed");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
    if (dead.length) await this.d.store.deleteTokens(dead);
    return { sent, failed };
  }

  /** Admin campaign: inbox rows go to every opted-in customer immediately; pushes are sent in the background. */
  async startCampaign(c: CampaignRec): Promise<{ recipients: number; devices: number; pushConfigured: boolean }> {
    const recipients = await this.d.store.addPromoInbox({ title: c.title, body: c.body, deepLink: c.deepLink });
    const tokens = await this.d.store.promoTokens();
    const job = (async () => {
      let failed = 0;
      if (this.configured && tokens.length) failed = (await this.sendTo(tokens, { title: c.title, body: c.body, deepLink: c.deepLink, kind: "promo" })).failed;
      await this.d.store.finishCampaign(c.id, { recipients, failed });
    })().catch((e) => this.d.log?.error({ err: String(e), campaign: c.id }, "campaign failed"));
    this.pending.add(job); void job.finally(() => this.pending.delete(job));
    return { recipients, devices: tokens.length, pushConfigured: this.configured };
  }
  async idle() { await Promise.all([...this.pending]); }
}
export type { NotificationKind };
