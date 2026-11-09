import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { ReelRec, ReelStore } from "../reelStore.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";

const MAX_REEL_BYTES = 25 * 1024 * 1024;
const idParam = z.string().uuid();
const looksLikeMp4 = (b: Buffer) => b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp";
const reelBody = z.object({
  title: z.string().trim().min(2).max(60),
  target: z.string().trim().regex(/^(cat|sec):[a-z0-9-]{1,60}$/, "Choose a category or section").nullish().transform((v) => v || null),
  sortOrder: z.number().int().min(0).max(9999).default(0), isActive: z.boolean().default(true),
});

/** Admin management of the "Watch & Shop" video cards (title, where a tap goes, one short MP4). */
export function reelRoutes(app: FastifyInstance, d: { reels: ReelStore; storage: Storage; store: Store; auth: ReturnType<typeof makeAuth> }) {
  const { reels, storage, store, auth } = d;
  const staff = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const toApi = (r: ReelRec) => ({ id: r.id, title: r.title, target: r.target, sortOrder: r.sortOrder, isActive: r.isActive, videoUrl: r.videoKey ? storage.url(r.videoKey) : null });
  const log = (req: any, action: string, id?: string) => store.logActivity({ adminId: req.user.id, action, entity: "reel", entityId: id, ip: req.ip });

  app.get("/admin/reels", staff, async () => ({ items: (await reels.list(false)).map(toApi) }));
  app.post("/admin/reels", staff, async (req, reply) => { const r = await reels.create(reelBody.parse(req.body)); await log(req, "reel.create", r.id); return reply.status(201).send(toApi(r)); });
  app.put<{ Params: { id: string } }>("/admin/reels/:id", staff, async (req) => {
    const id = idParam.parse(req.params.id); const r = await reels.update(id, reelBody.parse(req.body)); if (!r) throw notFound("Video card not found");
    await log(req, "reel.update", id); return toApi(r);
  });
  app.delete<{ Params: { id: string } }>("/admin/reels/:id", staff, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await reels.remove(id); if (!r) throw notFound("Video card not found");
    if (r.videoKey) await storage.delete(r.videoKey).catch(() => {});
    await log(req, "reel.delete", id); return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>("/admin/reels/:id/video", staff, async (req) => {
    const id = idParam.parse(req.params.id); if (!(await reels.get(id))) throw notFound("Video card not found");
    const file = await req.file({ limits: { fileSize: MAX_REEL_BYTES } }); if (!file) throw new AppError(400, "NO_FILE", "Choose a video to upload");
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, "TOO_LARGE", `Video is larger than ${MAX_REEL_BYTES / 1024 / 1024} MB. Keep it short (under 30 seconds) or compress it.`);
    if (!looksLikeMp4(buf)) throw new AppError(400, "BAD_VIDEO", "Please upload an MP4 video (H.264).");
    const key = `videos/reel/${id}/${randomUUID()}.mp4`;
    await storage.put(key, buf, "video/mp4");
    const old = await reels.setVideo(id, key); if (old) await storage.delete(old).catch(() => {});
    await log(req, "reel.video", id); return { videoUrl: storage.url(key) };
  });
  app.delete<{ Params: { id: string } }>("/admin/reels/:id/video", staff, async (req, reply) => {
    const id = idParam.parse(req.params.id); const old = await reels.setVideo(id, null); if (old === undefined) throw notFound("Video card not found");
    if (old) await storage.delete(old).catch(() => {});
    await log(req, "reel.video.delete", id); return reply.status(204).send();
  });
}
