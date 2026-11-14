import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EngageStore } from "../engageStore.js";
import type { OrderStore } from "../orderStore.js";
import type { CatalogStore } from "../catalogStore.js";
import type { Store } from "../store.js";
import type { makeAuth } from "../plugins/auth.js";
import { AppError, notFound } from "../errors.js";
import { totalStock } from "../catalogStore.js";
import type { PushStore } from "../pushStore.js";
import type { PushService } from "../pushService.js";

const uuid = z.string().uuid();
const shortName = (full: string) => { const p = full.trim().split(/\s+/).filter(Boolean); return p.length ? (p[0] + (p[1] ? ` ${p[1][0]!.toUpperCase()}.` : "")).slice(0, 30) : "Customer"; };
const toApi = (r: { id: string; rating: number; body: string; author: string; createdAt: Date }) => ({ id: r.id, rating: r.rating, body: r.body, author: r.author, createdAt: r.createdAt });

export function engageRoutes(app: FastifyInstance, d: { engage: EngageStore; orders: OrderStore; catalog: CatalogStore; store: Store; auth: ReturnType<typeof makeAuth> }) {
  const { engage, orders, catalog, store, auth } = d;
  const pre = { preHandler: auth.customer }; const staff = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };

  // ---- reviews: everybody can read; only a customer whose order with this product was delivered can write ----
  app.get<{ Params: { id: string } }>("/products/:id/reviews", { preHandler: auth.optionalCustomer }, async (req) => {
    const id = uuid.safeParse(req.params.id); if (!id.success) throw notFound("Product not found");
    const [items, sum] = await Promise.all([engage.listReviews(id.data, 50), engage.summary(id.data)]);
    const uid = req.user?.id;
    const mine = uid ? await engage.myReview(id.data, uid) : null;
    const canReview = uid ? await orders.hasDelivered(uid, id.data) : false;
    return { avg: sum.avg, count: sum.count, items: items.map(toApi), mine: mine ? toApi(mine) : null, canReview };
  });
  app.post<{ Params: { id: string } }>("/products/:id/reviews", { ...pre, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = uuid.parse(req.params.id);
    const b = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(600).default("") }).parse(req.body);
    if (!(await catalog.getProduct(id, true))) throw notFound("Product not found");
    if (!(await orders.hasDelivered(req.user!.id, id))) throw new AppError(403, "NOT_BUYER", "Only customers who received this product can review it.");
    const u = await store.findUserById(req.user!.id);
    const r = await engage.upsertReview({ productId: id, userId: req.user!.id, rating: b.rating, body: b.body, author: shortName(u?.fullName ?? "") });
    return reply.status(201).send(toApi(r));
  });

  // ---- "tell me when it is back" ----
  app.get<{ Params: { id: string } }>("/me/stock-alerts/:id", pre, async (req) => ({ subscribed: await engage.alertHas(req.user!.id, uuid.parse(req.params.id)) }));
  app.put<{ Params: { id: string } }>("/me/stock-alerts/:id", pre, async (req) => {
    const id = uuid.parse(req.params.id); const p = await catalog.getProduct(id, true); if (!p) throw notFound("Product not found");
    await engage.alertSet(req.user!.id, id, true); return { subscribed: true };
  });
  app.delete<{ Params: { id: string } }>("/me/stock-alerts/:id", pre, async (req, reply) => { await engage.alertSet(req.user!.id, uuid.parse(req.params.id), false); return reply.status(204).send(); });

  // ---- admin moderation ----
  app.get("/admin/reviews", staff, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
    const r = await engage.adminReviews(q.page, q.limit);
    return { items: r.items.map((x) => ({ ...toApi(x), productId: x.productId, productName: x.productName, isHidden: x.isHidden })), total: r.total, page: q.page, limit: q.limit };
  });
  app.patch<{ Params: { id: string } }>("/admin/reviews/:id", staff, async (req) => {
    const id = uuid.parse(req.params.id); const b = z.object({ hidden: z.boolean() }).parse(req.body);
    if (!(await engage.setHidden(id, b.hidden))) throw notFound("Review not found"); return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/admin/reviews/:id", staff, async (req, reply) => { if (!(await engage.deleteReview(uuid.parse(req.params.id)))) throw notFound("Review not found"); return reply.status(204).send(); });
}

/**
 * Looks at every product somebody is waiting for; when it has stock again the waiting customers get an inbox entry and a phone push, once.
 * Runs on a timer, so it also catches stock that comes back from a cancelled order or a bulk edit.
 */
export async function runRestockAlerts(d: { engage: EngageStore; catalog: CatalogStore; pushStore: PushStore; push: PushService; log?: { error(o: object, m: string): void } }) {
  for (const pid of await d.engage.alertProductIds()) {
    try {
      const p = await d.catalog.getProduct(pid, true);
      if (!p) { await d.engage.takeAlerts(pid); continue; }      // removed or unpublished: nobody is waiting any more
      if (totalStock(p) <= 0) continue;
      const title = "Back in stock"; const body = `${p.name} is available again. Order before it sells out!`; const deepLink = `talhastudio://product/${pid}`;
      for (const uid of await d.engage.takeAlerts(pid)) {
        const rec = await d.pushStore.addNotification(uid, { title, body, deepLink, kind: "promo" });
        const tokens = await d.pushStore.tokensForUser(uid);
        if (tokens.length && d.push.configured) await d.push.sendTo(tokens, { title, body, deepLink, kind: "promo", notificationId: rec.id });
      }
    } catch (err) { d.log?.error({ err: String(err), product: pid }, "restock alert failed"); }
  }
}
