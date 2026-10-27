import { randomUUID } from "node:crypto";
import type { MemoryCatalog } from "./memoryCatalog.js";
import type { MemoryCoupons } from "./memoryCoupons.js";
import type { MemoryStore } from "./memoryStore.js";
import { canTransition, CUSTOMER_CANCELLABLE, restoresStock, type OrderStatus } from "./orderStatus.js";
import {
  OpenOrdersLimitError, OPEN_STATUSES, OrderIssuesError, TransitionError,
  type Analytics, type CustomerRow, type NewOrderInput, type OrderFilter, type OrderRec, type OrderStore, type OrderSummary,
} from "./orderStore.js";
import { priceCart } from "./pricing.js";

/** In-memory OrderStore mirroring PgOrders semantics (used by tests). */
export class MemoryOrders implements OrderStore {
  orders: OrderRec[] = []; keys = new Map<string, string>(); returns: { orderId: string; reason: string }[] = []; seq = 100001;
  constructor(private catalog: MemoryCatalog, private users: MemoryStore, private coupons?: MemoryCoupons) {}

  private variant(id: string) { for (const p of this.catalog.prods.values()) { const v = p.variants.find((x) => x.id === id); if (v) return v; } return undefined; }

  async createOrder(i: NewOrderInput) {
    const key = `${i.userId}:${i.idempotencyKey}`; const prior = this.keys.get(key);
    if (prior) return { order: this.orders.find((o) => o.id === prior)!, created: false };
    if (i.maxOpenOrders && this.orders.filter((o) => o.userId === i.userId && (OPEN_STATUSES as readonly string[]).includes(o.status)).length >= i.maxOpenOrders) throw new OpenOrdersLimitError();
    const found = new Map(this.catalog.lookup(i.items.map((x) => x.variantId)).map((v) => [v.variantId, v]));
    const rec = i.couponCode ? this.coupons?.rows.find((c) => c.code.toLowerCase() === i.couponCode!.toLowerCase()) ?? null : null;
    const priced = priceCart(i.items, found, i.cfg, { requested: i.couponCode ?? null, rec, now: new Date() });
    if (priced.issues.length) throw new OrderIssuesError(priced.issues);
    if (priced.couponCode && rec) rec.usedCount += 1;
    for (const l of priced.lines) this.variant(l.variantId)!.stock -= l.qty;
    const now = new Date();
    const o: OrderRec = {
      id: randomUUID(), orderNumber: `TS-${this.seq++}`, userId: i.userId, status: "pending", paymentMethod: "cod", paymentStatus: "unpaid",
      subtotal: priced.subtotal, discount: priced.discount, shipping: priced.shipping, total: priced.total, couponCode: priced.couponCode,
      customer: i.customer, address: i.address, notes: i.notes, trackingUrl: null,
      items: priced.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, name: l.name, sku: l.sku, size: l.size, color: l.color, unitPrice: l.unitPrice, qty: l.qty, thumbKey: l.thumbKey })),
      history: [{ status: "pending", note: null, at: now }], createdAt: now, updatedAt: now,
    };
    this.orders.unshift(o); this.keys.set(key, o.id); return { order: o, created: true };
  }

  private summary(o: OrderRec): OrderSummary {
    return { id: o.id, orderNumber: o.orderNumber, status: o.status, total: o.total, createdAt: o.createdAt, itemCount: o.items.reduce((a, x) => a + x.qty, 0),
      firstItemName: o.items[0]?.name ?? null, firstThumbKey: o.items[0]?.thumbKey ?? null, customerName: o.customer.name, customerPhone: o.customer.phone };
  }
  async listForUser(userId: string, page: number, limit: number) {
    const mine = this.orders.filter((o) => o.userId === userId);
    return { items: mine.slice((page - 1) * limit, page * limit).map((o) => this.summary(o)), total: mine.length };
  }
  async getForUser(userId: string, id: string) { return this.orders.find((o) => o.id === id && o.userId === userId) ?? null; }

  private apply(o: OrderRec, to: OrderStatus, note: string | null, tracking: string | null) {
    if (!canTransition(o.status, to)) throw new TransitionError(`Cannot change an order from ${o.status} to ${to}`);
    if (restoresStock(to)) {
      for (const it of o.items) if (it.variantId) { const v = this.variant(it.variantId); if (v) v.stock += it.qty; }
      const c = o.couponCode ? this.coupons?.rows.find((x) => x.code === o.couponCode) : undefined; if (c && c.usedCount > 0) c.usedCount -= 1;   // a cancelled order gives its coupon use back
    }
    if (to === "delivered") o.paymentStatus = "paid";
    if (to === "refunded" && o.paymentStatus === "paid") o.paymentStatus = "refunded";
    if (tracking) o.trackingUrl = tracking;
    o.status = to; o.updatedAt = new Date(); o.history.push({ status: to, note, at: o.updatedAt });
    return o;
  }
  async customerCancel(userId: string, id: string) {
    const o = await this.getForUser(userId, id); if (!o) return null;
    if (!CUSTOMER_CANCELLABLE.includes(o.status)) throw new TransitionError("This order can no longer be cancelled online. Please contact support.");
    return this.apply(o, "cancelled", "Cancelled by customer", null);
  }
  async requestReturn(userId: string, id: string, reason: string, windowDays: number) {
    const o = await this.getForUser(userId, id); if (!o) return null;
    if (o.status !== "delivered") throw new TransitionError("Only delivered orders can be returned.");
    const deliveredAt = [...o.history].reverse().find((h) => h.status === "delivered")!.at;
    if (Date.now() - deliveredAt.getTime() > windowDays * 86400_000) throw new TransitionError(`The ${windowDays}-day return window has passed.`);
    this.returns.push({ orderId: id, reason });
    return this.apply(o, "refund_requested", reason, null);
  }

  private filtered(f: Omit<OrderFilter, "page" | "limit">) {
    return this.orders.filter((o) => (!f.status || o.status === f.status)
      && (!f.q || [o.orderNumber, o.customer.name, o.customer.email, o.customer.phone].some((x) => x.toLowerCase().includes(f.q!.toLowerCase())))
      && (!f.from || o.createdAt >= new Date(f.from)) && (!f.to || o.createdAt < new Date(new Date(f.to).getTime() + 86400_000)));
  }
  async adminList(f: OrderFilter) { const r = this.filtered(f); return { items: r.slice((f.page - 1) * f.limit, f.page * f.limit).map((o) => this.summary(o)), total: r.length }; }
  async adminGet(id: string) { return this.orders.find((o) => o.id === id) ?? null; }
  async adminSetStatus(id: string, to: OrderStatus, note: string | null, trackingUrl: string | null) {
    const o = await this.adminGet(id); return o ? this.apply(o, to, note, trackingUrl) : null;
  }
  async adminExport(f: Omit<OrderFilter, "page" | "limit">) { return this.filtered(f).slice(0, 5000); }
  async adminCustomers(q: string | undefined, page: number, limit: number) {
    const rows: CustomerRow[] = [...this.users.users.values()].filter((u) => u.role === "customer" && !u.deletedAt && (!q || (u.email + u.fullName).toLowerCase().includes(q.toLowerCase())))
      .map((u) => { const mine = this.orders.filter((o) => o.userId === u.id && !["cancelled", "refunded"].includes(o.status));
        return { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, createdAt: u.createdAt, orders: mine.length, spent: mine.reduce((a, o) => a + o.total, 0) }; });
    return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length };
  }
  async analytics(days: number): Promise<Analytics> {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - (days - 1));
    const inRange = this.orders.filter((o) => o.createdAt >= since); const counted = inRange.filter((o) => !["cancelled", "refunded"].includes(o.status));
    const series = Array.from({ length: days }, (_, k) => { const d = new Date(since); d.setUTCDate(d.getUTCDate() + k); const key = d.toISOString().slice(0, 10);
      const day = counted.filter((o) => o.createdAt.toISOString().slice(0, 10) === key); return { date: key, orders: day.length, sales: day.reduce((a, o) => a + o.total, 0) }; });
    const byStatus: Record<string, number> = {}; for (const o of this.orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    const top = new Map<string, { qty: number; revenue: number }>();
    for (const o of counted) for (const it of o.items) { const t = top.get(it.name) ?? { qty: 0, revenue: 0 }; t.qty += it.qty; t.revenue += it.qty * it.unitPrice; top.set(it.name, t); }
    const topProducts = [...top.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return { topProducts, sales: counted.reduce((a, o) => a + o.total, 0), orders: inRange.length, pending: this.orders.filter((o) => o.status === "pending").length, customers: 0, series, byStatus };
  }
  async exportForUser(userId: string) { return this.orders.filter((o) => o.userId === userId).slice(0, 1000); }
}
