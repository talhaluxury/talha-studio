import type { BrandStore, BrandTag } from "./brandStore.js";
import type { OrderEvents } from "./events.js";
import type { OrderRec } from "./orderStore.js";
import type { PushService } from "./pushService.js";
import type { PushStore } from "./pushStore.js";

/** The app opens its seller screen for this link. */
export const SELLER_LINK = "talhastudio://seller";
interface Logger { error(o: object, m: string): void }

/**
 * Tells sellers (inbox entry + phone push) when someone buys one of their products or when the admin reviews their brand,
 * and tells the admin phones when a seller applies or submits a page. Everything is best effort: a failure here never touches an order.
 */
export class SellerAlerts implements OrderEvents {
  constructor(private d: { brands: BrandStore; pushStore: PushStore; push: PushService; log?: Logger }) {}

  async orderPlaced(o: OrderRec) {
    try {
      const ids = o.items.map((i) => i.productId).filter((x): x is string => !!x);
      if (!ids.length) return;
      const tags = await this.d.brands.tagsForProducts(ids);
      const per = new Map<string, { tag: BrandTag; qty: number; sum: number }>();
      for (const i of o.items) {
        const tag = i.productId ? tags.get(i.productId) : undefined; if (!tag) continue;
        const e = per.get(tag.id) ?? { tag, qty: 0, sum: 0 }; e.qty += i.qty; e.sum += i.qty * i.unitPrice; per.set(tag.id, e);
      }
      for (const e of per.values()) {
        await this.notifyOwner(e.tag.ownerId, `New order for ${e.tag.name}`, `${o.orderNumber} · ${e.qty} item${e.qty === 1 ? "" : "s"} · Rs. ${e.sum.toLocaleString("en-PK")}`);
      }
    } catch (err) { this.d.log?.error({ err: String(err), order: o.orderNumber }, "seller order alert failed"); }
  }
  async statusChanged() { /* sellers do not get status pings in this version */ }

  async notifyOwner(ownerId: string, title: string, body: string) {
    try {
      const rec = await this.d.pushStore.addNotification(ownerId, { title, body, deepLink: SELLER_LINK, kind: "order" });
      const prefs = await this.d.pushStore.getPrefs(ownerId);
      if (!prefs.orderUpdates || !this.d.push.configured) return;
      const tokens = await this.d.pushStore.tokensForUser(ownerId);
      if (tokens.length) await this.d.push.sendTo(tokens, { title, body, deepLink: SELLER_LINK, kind: "order", notificationId: rec.id });
    } catch (err) { this.d.log?.error({ err: String(err) }, "seller notification failed"); }
  }

  async notifyAdmins(title: string, body: string) {
    try {
      if (!this.d.push.configured) return;
      const tokens = await this.d.pushStore.adminTokens();
      if (tokens.length) await this.d.push.sendTo(tokens, { title, body, deepLink: "admin://brands", kind: "order" });
    } catch (err) { this.d.log?.error({ err: String(err) }, "admin brand alert failed"); }
  }
}
