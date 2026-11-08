import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../errors.js";
import type { BannerStore } from "../bannerStore.js";
import type { CatalogStore } from "../catalogStore.js";
import type { Store } from "../store.js";
import type { Storage } from "../storage.js";
import type { makeAuth } from "../plugins/auth.js";
import type { VideoEntity, VideoStore } from "../videoStore.js";

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const idParam = z.string().uuid();
/** MP4 / MOV files start with a box whose type "ftyp" sits at byte 4. */
const looksLikeMp4 = (b: Buffer) => b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp";

/** Lets the admin attach ONE short video to a product or a home banner. */
export function videoRoutes(app: FastifyInstance, d: { videos: VideoStore; catalog: CatalogStore; banners: BannerStore; storage: Storage; store: Store; auth: ReturnType<typeof makeAuth> }) {
  const { videos, catalog, banners, storage, store, auth } = d;
  const staff = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const exists = async (entity: VideoEntity, id: string) => entity === "product" ? !!(await catalog.getProduct(id, false)) : !!(await banners.get(id));

  for (const entity of ["product", "banner"] as const) {
    const base = entity === "product" ? "/admin/products/:id/video" : "/admin/banners/:id/video";
    app.post<{ Params: { id: string } }>(base, staff, async (req) => {
      const id = idParam.parse(req.params.id); if (!(await exists(entity, id))) throw notFound(entity === "product" ? "Product not found" : "Banner not found");
      const file = await req.file({ limits: { fileSize: MAX_VIDEO_BYTES } }); if (!file) throw new AppError(400, "NO_FILE", "Choose a video to upload");
      const buf = await file.toBuffer();
      if (file.file.truncated) throw new AppError(413, "TOO_LARGE", `Video is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Keep it short (under 30 seconds) or compress it.`);
      if (!looksLikeMp4(buf)) throw new AppError(400, "BAD_VIDEO", "Please upload an MP4 video (H.264).");
      const key = `videos/${entity}/${id}/${randomUUID()}.mp4`;
      await storage.put(key, buf, "video/mp4");
      const old = await videos.set(entity, id, key);
      if (old) await storage.delete(old).catch(() => {});
      await store.logActivity({ adminId: req.user!.id, action: `${entity}.video`, entity, entityId: id, ip: req.ip });
      return { videoUrl: storage.url(key) };
    });
    app.delete<{ Params: { id: string } }>(base, staff, async (req, reply) => {
      const id = idParam.parse(req.params.id); const old = await videos.remove(entity, id);
      if (old) await storage.delete(old).catch(() => {});
      await store.logActivity({ adminId: req.user!.id, action: `${entity}.video.delete`, entity, entityId: id, ip: req.ip });
      return reply.status(204).send();
    });
  }
}
