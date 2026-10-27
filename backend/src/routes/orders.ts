import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../errors.js";
import type { Config } from "../config.js";
import { noEvents, type OrderEvents } from "../events.js";
import { OpenOrdersLimitError, OrderIssuesError, TransitionError, type OrderRec, type OrderStore, type OrderSummary } from "../orderStore.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Storage } from "../storage.js";
import type { SettingsStore } from "../settingsStore.js";
import { priceCfgFrom } from "./catalog.js";

export const toApiOrder = (o: OrderRec, s: Storage) => ({
  id: o.id, orderNumber: o.orderNumber, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
  subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, couponCode: o.couponCode,
  customer: o.customer, address: o.address, notes: o.notes, trackingUrl: o.trackingUrl,
  items: o.items.map((i) => ({ productId: i.productId, variantId: i.variantId, name: i.name, sku: i.sku, size: i.size, color: i.color, unitPrice: i.unitPrice, qty: i.qty, imageUrl: i.thumbKey ? s.url(i.thumbKey) : null })),
  history: o.history.map((h) => ({ status: h.status, note: h.note, at: h.at })), createdAt: o.createdAt, updatedAt: o.updatedAt,
});
export const toApiSummary = (o: OrderSummary, s: Storage) => ({
  id: o.id, orderNumber: o.orderNumber, status: o.status, total: o.total, createdAt: o.createdAt, itemCount: o.itemCount,
  firstItemName: o.firstItemName, imageUrl: o.firstThumbKey ? s.url(o.firstThumbKey) : null, customerName: o.customerName, customerPhone: o.customerPhone,
});
export function mapOrderError(e: unknown): unknown {
  if (e instanceof OrderIssuesError) return new AppError(409, "CART_ISSUES", "Some items in your cart changed. Please review your cart.", undefined, { issues: e.issues });
  if (e instanceof OpenOrdersLimitError) return new AppError(429, "TOO_MANY_OPEN_ORDERS", "You already have several orders waiting to be processed. Please wait until they are handled or cancel one.");
  if (e instanceof TransitionError) return new AppError(409, "CONFLICT", e.message);
  return e;
}

const phone = z.string().trim().regex(/^\+?[0-9 \-]{7,16}$/, "Enter a valid phone number");
export const placeOrderBody = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30),
  customer: z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(254), phone }),
  address: z.object({
    line1: z.string().trim().min(3).max(200), line2: z.string().trim().max(200).nullish().transform((v) => v || null),
    city: z.string().trim().min(2).max(80), province: z.string().trim().max(80).nullish().transform((v) => v || null),
    postalCode: z.string().trim().max(12).nullish().transform((v) => v || null),
  }),
  notes: z.string().trim().max(300).nullish().transform((v) => v || null),
  paymentMethod: z.literal("cod"),
  couponCode: z.string().trim().toUpperCase().max(20).nullish().transform((v) => v || null),
});

export function orderRoutes(app: FastifyInstance, d: { orders: OrderStore; storage: Storage; auth: ReturnType<typeof makeAuth>; cfg: Config; settings: SettingsStore; events?: OrderEvents }) {
  const { orders, storage, auth, cfg, settings } = d; const events = d.events ?? noEvents;
  const pre = { preHandler: auth.customer };
  const idParam = z.string().uuid();
  const fire = (p: Promise<void>, req: { log: { error: (o: object, m: string) => void } }) => p.catch((err) => req.log.error({ err: String(err) }, "order event failed"));

  app.post("/orders", { preHandler: auth.customer, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Idempotency-Key header (8-64 chars) is required").parse(req.headers["idempotency-key"]);
    const b = placeOrderBody.parse(req.body);
    try {
      const { order, created } = await orders.createOrder({ userId: req.user!.id, idempotencyKey: key, items: b.items, customer: b.customer, address: b.address, notes: b.notes, cfg: await priceCfgFrom(settings, cfg), couponCode: b.couponCode, maxOpenOrders: cfg.MAX_OPEN_ORDERS_PER_USER });
      if (created) await fire(events.orderPlaced(order), req);
      return reply.status(created ? 201 : 200).send(toApiOrder(order, storage));
    } catch (e) { throw mapOrderError(e); }
  });

  app.get("/me/orders", pre, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const r = await orders.listForUser(req.user!.id, q.page, q.limit);
    return { items: r.items.map((o) => toApiSummary(o, storage)), page: q.page, limit: q.limit, total: r.total };
  });
  app.get<{ Params: { id: string } }>("/me/orders/:id", pre, async (req) => {
    const o = await orders.getForUser(req.user!.id, idParam.parse(req.params.id));
    if (!o) throw notFound("Order not found"); return toApiOrder(o, storage);
  });
  app.post<{ Params: { id: string } }>("/me/orders/:id/cancel", pre, async (req) => {
    const id = idParam.parse(req.params.id); const before = await orders.getForUser(req.user!.id, id); const prevStatus = before?.status;   // snapshot before update
    try {
      const o = await orders.customerCancel(req.user!.id, id); if (!o || !before) throw notFound("Order not found");
      await fire(events.statusChanged(o, prevStatus!), req); return toApiOrder(o, storage);
    } catch (e) { throw mapOrderError(e); }
  });
  app.post<{ Params: { id: string } }>("/me/orders/:id/return", pre, async (req) => {
    const id = idParam.parse(req.params.id); const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
    const before = await orders.getForUser(req.user!.id, id); const prevStatus = before?.status;   // snapshot before update
    try {
      const o = await orders.requestReturn(req.user!.id, id, reason, cfg.RETURN_WINDOW_DAYS); if (!o || !before) throw notFound("Order not found");
      await fire(events.statusChanged(o, prevStatus!), req); return toApiOrder(o, storage);
    } catch (e) { throw mapOrderError(e); }
  });
}
