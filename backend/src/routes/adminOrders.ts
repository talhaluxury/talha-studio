import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conflict, notFound } from "../errors.js";
import type { Config } from "../config.js";
import { noEvents, type OrderEvents } from "../events.js";
import { allowedNext, ORDER_STATUSES, STATUS_LABEL } from "../orderStatus.js";
import type { OrderRec, OrderStore } from "../orderStore.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Storage } from "../storage.js";
import type { WhatsAppService } from "../whatsapp.js";
import type { Store } from "../store.js";
import type { BrandStore } from "../brandStore.js";
import { mapOrderError, toApiOrder, toApiSummary } from "./orders.js";

const status = z.enum(ORDER_STATUSES as [string, ...string[]]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filter = z.object({ status: status.optional(), q: z.string().trim().max(60).optional(), from: dateStr.optional(), to: dateStr.optional() });

/** Spreadsheet formula injection guard: cells starting with = + - @ are prefixed so Excel/Sheets never run them. */
export const csvCell = (v: unknown) => {
  let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
export const ordersCsv = (os: OrderRec[]) => {
  const head = ["Order", "Date", "Status", "Customer", "Phone", "Email", "City", "Address", "Items", "Subtotal", "Shipping", "Total", "Payment", "Payment status"];
  const rows = os.map((o) => [o.orderNumber, o.createdAt.toISOString(), STATUS_LABEL[o.status], o.customer.name, o.customer.phone, o.customer.email, o.address.city,
    [o.address.line1, o.address.line2].filter(Boolean).join(", "), o.items.map((i) => `${i.qty}x ${i.name}${i.size ? ` (${i.size}` + (i.color ? `/${i.color}` : "") + ")" : ""}`).join("; "),
    o.subtotal, o.shipping, o.total, o.paymentMethod.toUpperCase() + (o.paymentRef ? ` (${o.paymentRef})` : ""), o.paymentStatus]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
};

export function adminOrderRoutes(app: FastifyInstance, d: {
  orders: OrderStore; store: Store; storage: Storage; auth: ReturnType<typeof makeAuth>; cfg: Config; events?: OrderEvents; whatsapp?: WhatsAppService; brands?: BrandStore;
}) {
  const { orders, store, storage, auth, cfg } = d; const events = d.events ?? noEvents;
  const staff = { preHandler: [auth.admin] };
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const idParam = z.string().uuid();
  const withNext = (o: OrderRec) => ({ ...toApiOrder(o, storage), allowedNext: allowedNext(o.status) });
  /** Adds { brand: {id,name} | null } to every item (null = the store's own product). */
  const withBrands = async (o: OrderRec) => {
    const base = withNext(o); if (!d.brands) return base;
    const tags = await d.brands.tagsForProducts(o.items.flatMap((i) => (i.productId ? [i.productId] : [])));
    return { ...base, items: base.items.map((it) => { const t = it.productId ? tags.get(it.productId) : undefined; return { ...it, brand: t ? { id: t.id, name: t.name } : null }; }) };
  };

  app.get("/admin/orders", staff, async (req) => {
    const q = filter.extend({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const r = await orders.adminList({ ...q, status: q.status as never });
    // Marketplace: name the seller brand(s) behind each order so the owner sees at a glance whose products were bought.
    const pids = d.brands ? await orders.productIdsForOrders(r.items.map((o) => o.id)) : new Map<string, string[]>();
    const tags = d.brands ? await d.brands.tagsForProducts([...new Set([...pids.values()].flat())]) : new Map();
    const brandsOf = (id: string) => { const seen = new Map<string, string>(); for (const p of pids.get(id) ?? []) { const t = tags.get(p); if (t) seen.set(t.id, t.name); } return [...seen].map(([bid, name]) => ({ id: bid, name })); };
    return { items: r.items.map((o) => ({ ...toApiSummary(o, storage), brands: brandsOf(o.id) })), page: q.page, limit: q.limit, total: r.total };
  });

  app.get("/admin/orders/export.csv", manager, async (req, reply) => {
    const f = filter.parse(req.query); const rows = await orders.adminExport({ ...f, status: f.status as never });
    await store.logActivity({ adminId: req.user!.id, action: "orders.export", meta: { count: rows.length, ...f }, ip: req.ip });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="talha-orders-${new Date().toISOString().slice(0, 10)}.csv"`).send("\ufeff" + ordersCsv(rows));
  });

  app.get<{ Params: { id: string } }>("/admin/orders/:id", staff, async (req) => {
    const o = await orders.adminGet(idParam.parse(req.params.id)); if (!o) throw notFound("Order not found"); return withBrands(o);
  });

  // "Send on WhatsApp": the message (and product photo) goes out from the number linked in Admin > WhatsApp, same as the automatic order message.
  app.post<{ Params: { id: string } }>("/admin/orders/:id/whatsapp", { ...staff, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const id = idParam.parse(req.params.id);
    const b = z.object({ text: z.string().trim().min(1).max(1500), photo: z.boolean().default(true) }).parse(req.body);
    const o = await orders.adminGet(id); if (!o) throw notFound("Order not found");
    if (!d.whatsapp?.configured) throw conflict("WhatsApp is not linked. Scan the QR code in Admin > WhatsApp.");
    try { await d.whatsapp.sendOrderMessage(o, b.text, b.photo); } catch (e) { throw conflict((e as Error).message); }
    await store.logActivity({ adminId: req.user!.id, action: "order.whatsapp", entity: "order", entityId: id, meta: { photo: b.photo }, ip: req.ip });
    return { sent: true };
  });

  // Delete orders for good (owner/admin). Open orders are cancelled first so their stock goes back on sale.
  app.delete<{ Params: { id: string } }>("/admin/orders/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id);
    const r = await orders.adminDelete(id); if (!r) throw notFound("Order not found");
    await store.logActivity({ adminId: req.user!.id, action: "order.delete", entity: "order", entityId: id, meta: { orderNumber: r.orderNumber }, ip: req.ip });
    return reply.status(204).send();
  });
  app.post("/admin/orders/bulk-delete", manager, async (req) => {
    const b = z.object({ ids: z.array(idParam).min(1).max(100) }).parse(req.body);
    let deleted = 0; const numbers: string[] = [];
    for (const id of new Set(b.ids)) { const r = await orders.adminDelete(id); if (r) { deleted++; numbers.push(r.orderNumber); } }
    await store.logActivity({ adminId: req.user!.id, action: "order.bulk-delete", entity: "order", meta: { count: deleted, numbers }, ip: req.ip });
    return { deleted };
  });

  app.patch<{ Params: { id: string } }>("/admin/orders/:id/status", staff, async (req) => {
    const id = idParam.parse(req.params.id);
    const b = z.object({ status, note: z.string().trim().max(300).nullish().transform((v) => v || null),
      trackingUrl: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Tracking link must start with https://").nullish().transform((v) => v || null) }).parse(req.body);
    const before = await orders.adminGet(id); if (!before) throw notFound("Order not found");
    const prevStatus = before.status;   // snapshot: in-memory store mutates the same object
    try {
      const o = await orders.adminSetStatus(id, b.status as never, b.note, b.trackingUrl, req.user!.id); if (!o) throw notFound("Order not found");
      await store.logActivity({ adminId: req.user!.id, action: "order.status", entity: "order", entityId: id, meta: { from: prevStatus, to: o.status }, ip: req.ip });
      await events.statusChanged(o, prevStatus).catch((err) => req.log.error({ err: String(err) }, "order event failed"));
      return await withBrands(o);
    } catch (e) { throw mapOrderError(e); }
  });

  // Courier name + tracking number (shown to the customer on the order screen). Empty values clear them.
  app.patch<{ Params: { id: string } }>("/admin/orders/:id/tracking", staff, async (req) => {
    const id = idParam.parse(req.params.id);
    const b = z.object({ courier: z.string().trim().max(40).nullish().transform((v) => v || null), trackingNo: z.string().trim().max(60).nullish().transform((v) => v || null) }).parse(req.body);
    const o = await orders.setTracking(id, b.courier, b.trackingNo); if (!o) throw notFound("Order not found");
    await store.logActivity({ adminId: req.user!.id, action: "order.tracking", entity: "order", entityId: id, meta: { courier: b.courier }, ip: req.ip });
    return await withBrands(o);
  });

  app.patch<{ Params: { id: string } }>("/admin/orders/:id/payment", staff, async (req) => {
    const id = idParam.parse(req.params.id);
    const b = z.object({ status: z.enum(["paid", "unpaid"]) }).parse(req.body);
    const o = await orders.setPayment(id, b.status, req.user!.id); if (!o) throw notFound("Order not found");
    await store.logActivity({ adminId: req.user!.id, action: "order.payment", entity: "order", entityId: id, meta: { status: b.status }, ip: req.ip });
    return withBrands(o);
  });

  app.get("/admin/customers", manager, async (req) => {
    const q = z.object({ q: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const r = await orders.adminCustomers(q.q, q.page, q.limit);
    return { items: r.items, page: q.page, limit: q.limit, total: r.total };
  });

  // Block / unblock a customer (a blocked customer can not sign in and their open sessions stop working).
  app.patch<{ Params: { id: string } }>("/admin/customers/:id/active", manager, async (req) => {
    const id = idParam.parse(req.params.id); const b = z.object({ active: z.boolean() }).parse(req.body);
    const u = await store.findUserById(id); if (!u || u.role !== "customer" || u.deletedAt) throw notFound("Customer not found");
    await store.updateUser(id, { isActive: b.active });
    await store.logActivity({ adminId: req.user!.id, action: b.active ? "customer.unblock" : "customer.block", entity: "user", entityId: id, meta: {}, ip: req.ip });
    return { ok: true, isActive: b.active };
  });

  app.get("/admin/analytics", staff, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().refine((n) => [7, 30, 90].includes(n), "days must be 7, 30 or 90").default(30) }).parse(req.query);
    const [a, customers, recent] = await Promise.all([orders.analytics(days, cfg.STORE_TIMEZONE), store.countCustomers(), orders.adminList({ page: 1, limit: 6 })]);
    return { ...a, customers, days, recent: recent.items.map((o) => toApiSummary(o, storage)) };
  });
}
