import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { STATUS_TTL_MS, type SlideRec, type SlideStore, type StatusRec, type StatusStore } from "../contentStore.js";
import { AppError, notFound } from "../errors.js";
import { MAX_UPLOAD_BYTES, type ImageProcessor } from "../images.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";

const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Must be a single line");
const idParam = z.string().uuid();
const slideBody = z.object({
  title: z.string().trim().min(2).max(60).refine((s) => !/[\r]/.test(s), "Invalid text"),   // "\n" is allowed: it is the line break shown in the big heading
  body: oneLine(160).default(""), sortOrder: z.number().int().min(0).max(9999).default(0), isActive: z.boolean().default(true),
});

export const toApiSlide = (s: SlideRec, st: Storage) => ({ id: s.id, title: s.title, body: s.body, imageUrl: s.imageKey ? st.url(s.imageKey) : null, sortOrder: s.sortOrder, isActive: s.isActive });
const toApiStatus = (s: StatusRec, st: Storage) => ({ id: s.id, imageUrl: st.url(s.imageKey), caption: s.caption, createdAt: s.createdAt, expiresAt: s.expiresAt });

/** Reads a single uploaded image (plus an optional "caption" text field sent BEFORE the file) and returns the processed buffers. */
export async function readUpload(req: any, images: ImageProcessor) {
  const file = await req.file(); if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
  const caption = String((file.fields?.caption as { value?: unknown } | undefined)?.value ?? "").trim().slice(0, 300) || null;
  const buf = await file.toBuffer(); if (file.file.truncated) throw new AppError(413, "TOO_LARGE", `Image is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  return { out: await images.process(buf), caption };
}

export function contentRoutes(app: FastifyInstance, d: {
  slides: SlideStore; status: StatusStore; storage: Storage; images: ImageProcessor; store: Store; auth: ReturnType<typeof makeAuth>;
}) {
  const { slides, status, storage, images, store, auth } = d;
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const me = { preHandler: auth.customer };
  const log = (req: any, action: string, entity?: string, entityId?: string) => store.logActivity({ adminId: req.user.id, action, entity, entityId, ip: req.ip });
  const purge = async () => { for (const k of await status.purgeExpired(new Date())) await storage.delete(k).catch(() => {}); };

  // ---- onboarding (public: shown before anyone signs in) ----
  app.get("/onboarding", async (_req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return { slides: (await slides.live()).map((s) => ({ id: s.id, title: s.title, body: s.body, imageUrl: s.imageKey ? storage.url(s.imageKey) : null })) };
  });

  app.get("/admin/onboarding", manager, async () => ({ items: (await slides.list()).map((s) => toApiSlide(s, storage)) }));
  app.post("/admin/onboarding", manager, async (req, reply) => { const s = await slides.create(slideBody.parse(req.body)); await log(req, "onboarding.create", "onboarding", s.id); return reply.status(201).send(toApiSlide(s, storage)); });
  app.put<{ Params: { id: string } }>("/admin/onboarding/:id", manager, async (req) => {
    const id = idParam.parse(req.params.id); const s = await slides.update(id, slideBody.parse(req.body)); if (!s) throw notFound("Slide not found");
    await log(req, "onboarding.update", "onboarding", id); return toApiSlide(s, storage);
  });
  app.delete<{ Params: { id: string } }>("/admin/onboarding/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await slides.remove(id); if (!r.removed) throw notFound("Slide not found");
    if (r.imageKey) await storage.delete(r.imageKey).catch(() => {}); await log(req, "onboarding.delete", "onboarding", id); return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>("/admin/onboarding/:id/image", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); if (!(await slides.get(id))) throw notFound("Slide not found");
    const { out } = await readUpload(req, images); const key = `onboarding/${id}/${randomUUID()}.webp`;
    await storage.put(key, out.full, "image/webp");
    const r = await slides.setImage(id, key);
    if (!r.ok) { await storage.delete(key).catch(() => {}); throw notFound("Slide not found"); }
    if (r.oldKey) await storage.delete(r.oldKey).catch(() => {});
    await log(req, "onboarding.image", "onboarding", id); return reply.status(201).send({ imageUrl: storage.url(key) });
  });
  app.delete<{ Params: { id: string } }>("/admin/onboarding/:id/image", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await slides.setImage(id, null); if (!r.ok) throw notFound("Slide not found");
    if (r.oldKey) await storage.delete(r.oldKey).catch(() => {}); return reply.status(204).send();
  });

  // ---- status: daily pictures posted by the store, visible for 24 hours to signed-in customers ----
  app.get("/me/status", me, async () => { await purge(); return { items: (await status.live(new Date())).map((s) => toApiStatus(s, storage)) }; });
  app.post<{ Params: { id: string } }>("/me/status/:id/view", me, async (req, reply) => { await status.view(idParam.parse(req.params.id), req.user!.id); return reply.status(204).send(); });

  app.get("/admin/status", manager, async () => {
    await purge(); const live = await status.live(new Date()); const counts = await status.viewCounts(live.map((s) => s.id));
    return { items: live.map((s) => ({ ...toApiStatus(s, storage), views: counts.get(s.id) ?? 0 })) };
  });
  app.post("/admin/status", { ...manager, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { out, caption } = await readUpload(req, images); const key = `status/${randomUUID()}.webp`;
    await storage.put(key, out.full, "image/webp");
    const s = await status.create(key, caption, req.user!.id, new Date(Date.now() + STATUS_TTL_MS));
    await log(req, "status.create", "status", s.id); return reply.status(201).send({ ...toApiStatus(s, storage), views: 0 });
  });
  app.delete<{ Params: { id: string } }>("/admin/status/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await status.remove(id); if (!r.removed) throw notFound("Status not found");
    if (r.imageKey) await storage.delete(r.imageKey).catch(() => {}); await log(req, "status.delete", "status", id); return reply.status(204).send();
  });
}
