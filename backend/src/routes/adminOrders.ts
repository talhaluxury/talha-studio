import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../errors.js";
import type { Config } from "../config.js";
import { noEvents, type OrderEvents } from "../events.js";
import { allowedNext, ORDER_STATUSES, STATUS_LABEL } from "../orderStatus.js";
import type { OrderRec, OrderStore } from "../orderStore.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";
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
    o.subtotal, o.shipping, o.total, o.paymentMethod.toUpperCase(), o.paymentStatus]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
};

export function adminOrderRoutes(app: FastifyInstance, d: {
  orders: OrderStore; store: Store; storage: Storage; auth: ReturnType<typeof makeAuth>; cfg: Config; events?: OrderEvents;
}) {
  const { orders, store, storage, auth, cfg } = d; const events = d.events ?? noEvents;
  const staff = { preHandler: [auth.admin] };
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const idParam = z.string().uuid();
  const withNext = (o: OrderRec) => ({ ...toApiOrder(o, storage), allowedNext: allowedNext(o.status) });

  app.get("/admin/orders", staff, async (req) => {
    const q = filter.extend({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const r = await orders.adminList({ ...q, status: q.status as never });
    return { items: r.items.map((o) => toApiSummary(o, storage)), page: q.page, limit: q.limit, total: r.total };
  });

  app.get("/admin/orders/export.csv", manager, async (req, reply) => {
    const f = filter.parse(req.query); const rows = await orders.adminExport({ ...f, status: f.status as never });
    await store.logActivity({ adminId: req.user!.id, action: "orders.export", meta: { count: rows.length, ...f }, ip: req.ip });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="talha-orders-${new Date().toISOString().slice(0, 10)}.csv"`).send("\ufeff" + ordersCsv(rows));
  });

  app.get<{ Params: { id: string } }>("/admin/orders/:id", staff, async (req) => {
    const o = await orders.adminGet(idParam.parse(req.params.id)); if (!o) throw notFound("Order not found"); return withNext(o);
  });

  app.patch<{ Params: { id: string } }>("/admin/orders/:id/status", staff, async (req) => {
    const id = idParam.parse(req.params.id);
    const b = z.object({ status, note: z.string().trim().max(300).nullish().transform((v) => v || null),
      trackingUrl: z.string().trim().url().max(300).refine((u) => u.startsWith("https://"), "Tracking link must start with https://").nullish().transform((v) => v || null) }).parse(req.body);
    const before = await orders.adminGet(id); if (!before) throw notFound("Order not found");
    try {
      const o = await orders.adminSetStatus(id, b.status as never, b.note, b.trackingUrl, req.user!.id); if (!o) throw notFound("Order not found");
      await store.logActivity({ adminId: req.user!.id, action: "order.status", entity: "order", entityId: id, meta: { from: before.status, to: o.status }, ip: req.ip });
      await events.statusChanged(o, before.status).catch((err) => req.log.error({ err: String(err) }, "order event failed"));
      return withNext(o);
    } catch (e) { throw mapOrderError(e); }
  });

  app.get("/admin/customers", manager, async (req) => {
    const q = z.object({ q: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const r = await orders.adminCustomers(q.q, q.page, q.limit);
    return { items: r.items, page: q.page, limit: q.limit, total: r.total };
  });

  app.get("/admin/analytics", staff, async (req) => {
    const { days } = z.object({ days: z.coerce.number().int().refine((n) => [7, 30, 90].includes(n), "days must be 7, 30 or 90").default(30) }).parse(req.query);
    const [a, customers, recent] = await Promise.all([orders.analytics(days, cfg.STORE_TIMEZONE), store.countCustomers(), orders.adminList({ page: 1, limit: 6 })]);
    return { ...a, customers, days, recent: recent.items.map((o) => toApiSummary(o, storage)) };
  });
}
