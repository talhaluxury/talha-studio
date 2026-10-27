import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BannerStore } from "../bannerStore.js";
import { DuplicateCoupon, type CouponStore } from "../couponStore.js";
import { AppError, conflict, notFound } from "../errors.js";
import { MAX_UPLOAD_BYTES, type ImageProcessor } from "../images.js";
import type { makeAuth } from "../plugins/auth.js";
import { PAGE_SLUGS } from "../policyDefaults.js";
import type { SettingsStore } from "../settingsStore.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";
import { DEEP_LINK } from "./push.js";

const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Must be a single line");
const date = z.string().datetime({ offset: true }).nullish().transform((v) => (v ? new Date(v) : null));
const idParam = z.string().uuid();

const couponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "3-20 letters, numbers, - or _"),
  type: z.enum(["percent", "fixed"]), value: z.number().int().min(1).max(1_000_000),
  minSubtotal: z.number().int().min(0).max(10_000_000).default(0), maxUses: z.number().int().min(1).max(1_000_000).nullish().transform((v) => v ?? null),
  startsAt: date, endsAt: date, isActive: z.boolean().default(true),
}).superRefine((c, ctx) => {
  if (c.type === "percent" && c.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage cannot exceed 100" });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after the start" });
});
const bannerBody = z.object({
  title: z.string().trim().min(2).max(60), subtitle: oneLine(120).nullish().transform((v) => v || null),
  ctaLabel: oneLine(30).nullish().transform((v) => v || null),
  ctaLink: z.string().trim().max(200).nullish().transform((v) => v || null).refine((v) => v === null || (DEEP_LINK.test(v) && v.includes("/product/")), "Link must be talhastudio://product/<id>"),
  sortOrder: z.number().int().min(0).max(9999).default(0), isActive: z.boolean().default(true), startsAt: date, endsAt: date,
}).superRefine((b, ctx) => { if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after the start" }); });
const storeSettingsBody = z.object({
  shipping: z.object({ flat: z.number().int().min(0).max(100_000), freeOver: z.number().int().min(0).max(10_000_000) }),
  announcement: z.object({ text: oneLine(120), active: z.boolean() }),
  pages: z.object(Object.fromEntries(PAGE_SLUGS.map((s) => [s, z.string().max(20_000)])) as Record<(typeof PAGE_SLUGS)[number], z.ZodString>),
});

export const toApiCoupon = (c: import("../couponStore.js").CouponRec) => ({ id: c.id, code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal, maxUses: c.maxUses, usedCount: c.usedCount, startsAt: c.startsAt, endsAt: c.endsAt, isActive: c.isActive });
export const toApiBanner = (b: import("../bannerStore.js").BannerRec, s: Storage) => ({ id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, ctaLink: b.ctaLink, imageUrl: b.imageKey ? s.url(b.imageKey) : null, sortOrder: b.sortOrder, isActive: b.isActive, startsAt: b.startsAt, endsAt: b.endsAt });

export function adminCommerceRoutes(app: FastifyInstance, d: {
  coupons: CouponStore; banners: BannerStore; settings: SettingsStore; storage: Storage; images: ImageProcessor; store: Store; auth: ReturnType<typeof makeAuth>;
}) {
  const { coupons, banners, settings, storage, images, store, auth } = d;
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const owner = { preHandler: [auth.admin, auth.requireRole("owner")] };
  const log = (req: any, action: string, entity?: string, entityId?: string, meta?: unknown) => store.logActivity({ adminId: req.user.id, action, entity, entityId, meta, ip: req.ip });
  const page = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

  // ---- coupons ----
  app.get("/admin/coupons", manager, async (req) => { const q = page.parse(req.query); const r = await coupons.list(q.page, q.limit); return { items: r.items.map(toApiCoupon), page: q.page, limit: q.limit, total: r.total }; });
  app.post("/admin/coupons", manager, async (req, reply) => {
    const b = couponBody.parse(req.body);
    try { const c = await coupons.create(b); await log(req, "coupon.create", "coupon", c.id, { code: c.code }); return reply.status(201).send(toApiCoupon(c)); }
    catch (e) { throw e instanceof DuplicateCoupon ? conflict("That code already exists") : e; }
  });
  app.put<{ Params: { id: string } }>("/admin/coupons/:id", manager, async (req) => {
    const id = idParam.parse(req.params.id); const b = couponBody.parse(req.body);
    try { const c = await coupons.update(id, b); if (!c) throw notFound("Coupon not found"); await log(req, "coupon.update", "coupon", id, { code: c.code }); return toApiCoupon(c); }
    catch (e) { throw e instanceof DuplicateCoupon ? conflict("That code already exists") : e; }
  });
  app.delete<{ Params: { id: string } }>("/admin/coupons/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); if (!(await coupons.remove(id))) throw notFound("Coupon not found");
    await log(req, "coupon.delete", "coupon", id); return reply.status(204).send();
  });

  // ---- banners ----
  app.get("/admin/banners", manager, async () => ({ items: (await banners.list()).map((b) => toApiBanner(b, storage)) }));
  app.post("/admin/banners", manager, async (req, reply) => { const b = await banners.create(bannerBody.parse(req.body)); await log(req, "banner.create", "banner", b.id); return reply.status(201).send(toApiBanner(b, storage)); });
  app.put<{ Params: { id: string } }>("/admin/banners/:id", manager, async (req) => {
    const id = idParam.parse(req.params.id); const b = await banners.update(id, bannerBody.parse(req.body)); if (!b) throw notFound("Banner not found");
    await log(req, "banner.update", "banner", id); return toApiBanner(b, storage);
  });
  app.delete<{ Params: { id: string } }>("/admin/banners/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await banners.remove(id); if (!r.removed) throw notFound("Banner not found");
    if (r.imageKey) await storage.delete(r.imageKey).catch(() => {}); await log(req, "banner.delete", "banner", id); return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>("/admin/banners/:id/image", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); if (!(await banners.get(id))) throw notFound("Banner not found");
    const file = await req.file(); if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
    const buf = await file.toBuffer(); if (file.file.truncated) throw new AppError(413, "TOO_LARGE", `Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    const out = await images.process(buf); const key = `banners/${id}/${randomUUID()}.webp`;
    await storage.put(key, out.full, "image/webp");
    const r = await banners.setImage(id, key);
    if (!r.ok) { await storage.delete(key).catch(() => {}); throw notFound("Banner not found"); }
    if (r.oldKey) await storage.delete(r.oldKey).catch(() => {});
    await log(req, "banner.image", "banner", id); return reply.status(201).send({ imageUrl: storage.url(key) });
  });
  app.delete<{ Params: { id: string } }>("/admin/banners/:id/image", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await banners.setImage(id, null); if (!r.ok) throw notFound("Banner not found");
    if (r.oldKey) await storage.delete(r.oldKey).catch(() => {}); return reply.status(204).send();
  });

  // ---- store settings (owner): shipping charges, home announcement, policy pages ----
  app.get("/admin/store-settings", owner, async () => { const s = await settings.load(); return { shipping: s.shipping, announcement: s.announcement, pages: s.pages }; });
  app.put("/admin/store-settings", owner, async (req) => {
    const b = storeSettingsBody.parse(req.body); const cur = await settings.load();
    await settings.save({ ...cur, shipping: b.shipping, announcement: b.announcement, pages: b.pages });
    await log(req, "settings.store", undefined, undefined, { shipping: b.shipping, announcementActive: b.announcement.active });
    return b;
  });

  // ---- activity log (owner) ----
  app.get("/admin/activity-logs", owner, async (req) => {
    const q = page.extend({ action: z.string().trim().max(40).optional() }).parse(req.query);
    const r = await store.listActivity(q.page, q.limit, q.action); return { items: r.items, page: q.page, limit: q.limit, total: r.total };
  });
}
