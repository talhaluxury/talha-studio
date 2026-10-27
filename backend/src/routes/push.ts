import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, conflict, notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { PushService } from "../pushService.js";
import type { NotificationRec, PushStore } from "../pushStore.js";
import type { Store } from "../store.js";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const DEEP_LINK = new RegExp(`^talhastudio://(order|product)/${UUID}$`);
const token = z.string().min(20).max(4096);
const toApi = (n: NotificationRec) => ({ id: n.id, title: n.title, body: n.body, deepLink: n.deepLink, kind: n.kind, read: !!n.readAt, createdAt: n.createdAt });

export function pushRoutes(app: FastifyInstance, d: { store: Store; push: PushStore; svc: PushService; auth: ReturnType<typeof makeAuth> }) {
  const { store, push, svc, auth } = d;
  const me = { preHandler: auth.customer };
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };

  // ---- customer: devices ----
  app.post("/me/devices", { ...me, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = z.object({ fcmToken: token, platform: z.enum(["android"]).default("android") }).parse(req.body);
    await push.upsertDevice(req.user!.id, b.fcmToken, b.platform);
    return reply.status(204).send();
  });
  // POST (not DELETE /:token) so the device token never appears in URLs or access logs.
  app.post("/me/devices/unregister", me, async (req, reply) => {
    const b = z.object({ fcmToken: token }).parse(req.body);
    await push.removeDevice(req.user!.id, b.fcmToken);
    return reply.status(204).send();
  });

  // ---- customer: preferences + inbox ----
  app.get("/me/notification-preferences", me, async (req) => push.getPrefs(req.user!.id));
  const updatePrefs = async (req: any) => {
    const b = z.object({ orderUpdates: z.boolean().optional(), promotions: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Nothing to update").parse(req.body);
    return push.setPrefs(req.user!.id, b);
  };
  app.patch("/me/notification-preferences", me, updatePrefs);
  app.post("/me/notification-preferences", me, updatePrefs);      // Android's HttpURLConnection cannot send PATCH
  app.get("/me/notifications", me, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const r = await push.listNotifications(req.user!.id, q.page, q.limit);
    return { items: r.items.map(toApi), page: q.page, limit: q.limit, total: r.total, unread: r.unread };
  });
  app.get("/me/notifications/unread-count", me, async (req) => ({ unread: await push.unreadCount(req.user!.id) }));
  app.post("/me/notifications/read-all", me, async (req) => ({ updated: await push.markAllRead(req.user!.id) }));
  app.post<{ Params: { id: string } }>("/me/notifications/:id/read", me, async (req, reply) => {
    if (!(await push.markRead(req.user!.id, z.string().uuid().parse(req.params.id)))) throw notFound("Notification not found");
    return reply.status(204).send();
  });

  // ---- admin: campaigns ----
  app.get("/admin/campaigns", manager, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const [r, audience] = await Promise.all([push.listCampaigns(q.page, q.limit), push.promoAudience()]);
    return { items: r.items.map((c) => ({ id: c.id, title: c.title, body: c.body, deepLink: c.deepLink, sentAt: c.sentAt, recipients: c.recipients, failed: c.failed, createdAt: c.createdAt })),
      page: q.page, limit: q.limit, total: r.total, audience, pushConfigured: svc.configured };
  });
  app.post("/admin/campaigns", { ...manager, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = z.object({
      title: z.string().trim().min(2).max(65), body: z.string().trim().min(2).max(240),
      deepLink: z.string().trim().max(200).nullish().transform((v) => v || null).refine((v) => v === null || DEEP_LINK.test(v), "Link must be talhastudio://product/<id> or talhastudio://order/<id>"),
    }).parse(req.body);
    if (await push.hasRecentCampaign(b.title, b.body, 60_000)) throw conflict("This exact message was just sent. Wait a minute if you really want to send it again.");
    const c = await push.createCampaign({ ...b, createdBy: req.user!.id });
    const r = await svc.startCampaign(c);
    await store.logActivity({ adminId: req.user!.id, action: "campaign.send", entity: "campaign", entityId: c.id, meta: { recipients: r.recipients, devices: r.devices }, ip: req.ip });
    return reply.status(202).send({ id: c.id, ...r });
  });
}
export { AppError };
