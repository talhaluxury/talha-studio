import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import type { EmailService } from "../emailService.js";
import type { EmailLog, EmailStore } from "../emailStore.js";
import { notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SettingsStore } from "../settingsStore.js";
import type { Store } from "../store.js";
import { verifySvix } from "../webhooks.js";

const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Must be a single line");
const email = z.string().trim().toLowerCase().email().max(254);
const tpl = z.object({ subject: oneLine(200).pipe(z.string().min(1)), intro: z.string().trim().max(1000), footer: z.string().trim().max(500) });
const settingsBody = z.object({
  ownerEmail: z.union([email, z.literal("")]),
  store: z.object({ name: oneLine(80).pipe(z.string().min(1)), supportEmail: z.union([email, z.literal("")]), supportPhone: oneLine(30), address: oneLine(200) }),
  estimatedDelivery: oneLine(120),
  templates: z.object({ order_confirmation: tpl, owner_new_order: tpl, status_update: tpl }),
});

export const toApiLog = (l: EmailLog) => ({
  id: l.id, orderId: l.orderId, kind: l.kind, to: l.toEmail, status: l.status, attempts: l.attempts, providerState: l.providerState,
  lastError: l.lastError, subject: l.subject, createdAt: l.createdAt, sentAt: l.sentAt,
  // Honest wording: "sent" only means the provider accepted it. Only a provider webhook can confirm delivery.
  delivery: l.providerState === "delivered" ? "delivered" : l.providerState === "bounced" || l.providerState === "complained" ? l.providerState : l.status === "sent" ? "accepted_by_provider" : l.status,
});

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function adminEmailRoutes(app: FastifyInstance, d: {
  cfg: Config; email: EmailService; emails: EmailStore; settings: SettingsStore; store: Store; auth: ReturnType<typeof makeAuth>;
}) {
  const { cfg, email: svc, emails, settings, store, auth } = d;
  const owner = { preHandler: [auth.admin, auth.requireRole("owner")] };
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const status = async () => ({ provider: svc.providerName, configured: svc.configured, from: cfg.EMAIL_FROM, deliveryTracking: !!cfg.RESEND_WEBHOOK_SECRET && cfg.EMAIL_DRIVER === "resend", ...(await emails.counts()) });

  app.get("/admin/settings", owner, async () => ({ settings: await settings.load(), email: await status() }));
  app.put("/admin/settings", owner, async (req) => {
    const b = settingsBody.parse(req.body);
    await settings.save(b);
    await store.logActivity({ adminId: req.user!.id, action: "settings.update", meta: { ownerEmailSet: !!b.ownerEmail }, ip: req.ip });
    return { settings: await settings.load(), email: await status() };
  });
  app.post("/admin/email/test", { ...owner, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const to = (await settings.load()).ownerEmail;
    if (!to) return { ok: false, message: "Set and save the owner email first." };
    return svc.sendTest(to);
  });

  app.get("/admin/email-logs", manager, async (req) => {
    const q = z.object({ status: z.enum(["queued", "sent", "failed"]).optional(), page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
    const r = await emails.list(q);
    return { items: r.items.map(toApiLog), page: q.page, limit: q.limit, total: r.total, email: await status() };
  });
  app.post<{ Params: { id: string } }>("/admin/email-logs/:id/retry", manager, async (req) => {
    const id = z.string().uuid().parse(req.params.id);
    if (!(await emails.get(id))) throw notFound("Email not found");
    const ok = await svc.retry(id);
    await store.logActivity({ adminId: req.user!.id, action: "email.retry", entity: "email", entityId: id, ip: req.ip });
    return { retried: ok, message: ok ? "Queued for sending" : "Only failed emails can be retried" };
  });

  // Lets a free external pinger (e.g. cron-job.org) wake a sleeping host and flush the queue. Disabled unless CRON_SECRET is set.
  app.post("/internal/email/run", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!cfg.CRON_SECRET) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
    const given = String(req.headers["x-cron-secret"] ?? "");
    if (!safeEq(given, cfg.CRON_SECRET)) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid secret" } });
    return svc.processDue(25);
  });

  // Provider callbacks (Resend via Svix). The raw body is needed to verify the signature.
  app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "string" }, (_r, body, done) => done(null, body));
    hook.post("/webhooks/resend", async (req, reply) => {
      if (!cfg.RESEND_WEBHOOK_SECRET) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
      const body = String(req.body ?? "");
      const h = req.headers;
      if (!verifySvix({ secret: cfg.RESEND_WEBHOOK_SECRET, id: String(h["svix-id"] ?? ""), timestamp: String(h["svix-timestamp"] ?? ""), signature: String(h["svix-signature"] ?? ""), body }))
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid signature" } });
      let ev: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } };
      try { ev = JSON.parse(body); } catch { return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }); }
      const map: Record<string, string> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained", "email.delivery_delayed": "delayed" };
      const state = map[ev.type ?? ""];
      if (state && ev.data?.email_id) await emails.setProviderState(ev.data.email_id, state, state === "bounced" ? (ev.data.bounce?.message ?? "Bounced") : undefined);
      return { ok: true };
    });
  });
}
