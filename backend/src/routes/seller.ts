import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BrandDuplicateError, MAX_SECTIONS, contentKeys, sectionKeys, withoutProduct,
  type BrandRec, type BrandStore, type PageContent, type PageSection, type ProductLink,
} from "../brandStore.js";
import { MAX_VIDEO_BYTES } from "./videos.js";
import { DuplicateError, type CatalogStore, type ProductRec } from "../catalogStore.js";
import type { Config } from "../config.js";
import { AppError, conflict, forbidden, notFound } from "../errors.js";
import { MAX_IMAGES_PER_PRODUCT, type ImageProcessor } from "../images.js";
import type { OrderRec, OrderStore } from "../orderStore.js";
import { ORDER_STATUSES } from "../orderStatus.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SellerAlerts } from "../sellerNotify.js";
import type { Storage } from "../storage.js";
import { toApiProduct } from "./catalog.js";

const idParam = z.string().uuid();
const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Must be a single line");
const nullableText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const MAX_PRODUCTS_PER_BRAND = 200;

export const applyBody = z.object({
  name: oneLine(60).refine((s) => s.length >= 2, "Write the brand name"),
  contactPhone: z.string().trim().regex(/^\+?[0-9 \-]{7,16}$/, "Enter a valid phone number"),
  city: oneLine(60).refine((s) => s.length >= 2, "Write your city"),
  businessNote: z.string().trim().max(500).default(""),
});

/** Files the seller uploaded for this page live under brands/<brandId>/m/ (checked again against the brand when the page is saved). */
const mediaKey = z.string().regex(/^brands\/[0-9a-f-]{36}\/m\/[A-Za-z0-9-]{36}\.(webp|mp4)$/, "Upload the file again");
const secBase = { id: z.string().regex(/^[A-Za-z0-9-]{1,40}$/).optional(), hidden: z.boolean().default(false) };
const slideBody = z.object({
  imageKey: mediaKey, title: oneLine(60).default(""), subtitle: oneLine(120).default(""), buttonLabel: oneLine(24).default(""),
  productId: idParam.nullish().transform((v) => v ?? null),
});
export const sectionBody = z.discriminatedUnion("type", [
  z.object({ ...secBase, type: z.literal("banner"), slides: z.array(slideBody).min(1, "Add at least one banner picture").max(6) }),
  z.object({ ...secBase, type: z.literal("video"), videoKey: mediaKey, title: oneLine(60).default(""), caption: oneLine(160).default(""), autoplay: z.boolean().default(true) }),
  z.object({ ...secBase, type: z.literal("text"), heading: oneLine(80).default(""), body: z.string().trim().max(2000).default(""), align: z.enum(["start", "center"]).default("start") }),
  z.object({ ...secBase, type: z.literal("products"), title: oneLine(60).default(""), layout: z.enum(["grid", "carousel", "big"]).default("grid"), productIds: z.array(idParam).max(24).default([]) }),
  z.object({ ...secBase, type: z.literal("gallery"), title: oneLine(60).default(""), imageKeys: z.array(mediaKey).min(1, "Add at least one picture").max(8) }),
  z.object({ ...secBase, type: z.literal("features"), title: oneLine(60).default(""), items: z.array(oneLine(60).refine((x) => x.length > 0, "Empty")).min(1, "Add at least one point").max(6) }),
  z.object({ ...secBase, type: z.literal("spacer"), size: z.enum(["small", "medium", "large"]).default("medium") }),
]);
export const contentBody = z.object({
  name: oneLine(60).refine((s) => s.length >= 2, "Write the brand name"),
  tagline: oneLine(90).default(""),
  instagram: z.string().trim().max(31).nullish().transform((v) => v || null)
    .refine((v) => v === null || /^@?[A-Za-z0-9._]{1,30}$/.test(v), "Instagram username only, for example talhastudio")
    .transform((v) => (v ? v.replace(/^@/, "") : null)),
  website: z.string().trim().max(200).nullish().transform((v) => v || null).refine((v) => v === null || /^https:\/\/[^\s]{3,190}$/.test(v), "Must start with https://"),
  sections: z.array(sectionBody).max(MAX_SECTIONS).default([]),
});

const variantBody = z.object({ id: idParam.optional(), size: nullableText(20), color: nullableText(30), stock: z.number().int().min(0).max(100000) });
export const sellerProductBody = z.object({
  name: z.string().trim().min(2).max(160), description: z.string().trim().max(5000).default(""),
  categoryId: idParam, price: z.number().int().min(1).max(10_000_000),
  salePrice: z.number().int().min(1).nullish().transform((v) => v ?? null),
  fabric: nullableText(60), variants: z.array(variantBody).min(1).max(40),
}).superRefine((p, ctx) => {
  if (p.salePrice != null && p.salePrice >= p.price) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be lower than the price" });
  const seen = new Set<string>();
  p.variants.forEach((v, i) => { const k = `${(v.size ?? "").toLowerCase()}|${(v.color ?? "").toLowerCase()}`; if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["variants", i, "size"], message: "Same size and colour twice" }); seen.add(k); });
});

const media = (key: string, s: Storage) => ({ key, url: s.url(key) });
/** A section as the seller and the admin see it: every setting, with pictures/videos as {key,url}. Products are listed by id. */
export function toApiSection(sec: PageSection, s: Storage) {
  const base = { id: sec.id, type: sec.type, hidden: sec.hidden };
  switch (sec.type) {
    case "banner": return { ...base, slides: sec.slides.map((x) => ({ image: media(x.imageKey, s), title: x.title, subtitle: x.subtitle, buttonLabel: x.buttonLabel, productId: x.productId })) };
    case "video": return { ...base, video: media(sec.videoKey, s), title: sec.title, caption: sec.caption, autoplay: sec.autoplay };
    case "text": return { ...base, heading: sec.heading, body: sec.body, align: sec.align };
    case "products": return { ...base, title: sec.title, layout: sec.layout, productIds: sec.productIds };
    case "gallery": return { ...base, title: sec.title, images: sec.imageKeys.map((k) => media(k, s)) };
    case "features": return { ...base, title: sec.title, items: sec.items };
    case "spacer": return { ...base, size: sec.size };
  }
}
export const toApiContent = (c: PageContent, s: Storage) => ({
  name: c.name, tagline: c.tagline, logoUrl: c.logoKey ? s.url(c.logoKey) : null, coverUrl: c.coverKey ? s.url(c.coverKey) : null,
  instagram: c.instagram, website: c.website, sections: c.sections.map((x) => toApiSection(x, s)),
});
export const toSellerBrand = (b: BrandRec, s: Storage) => ({
  id: b.id, slug: b.slug, status: b.status, statusNote: b.statusNote, pageStatus: b.pageStatus, pageNote: b.pageNote,
  contactPhone: b.contactPhone, city: b.city, draft: toApiContent(b.draft, s), live: b.live ? toApiContent(b.live, s) : null,
  submittedAt: b.submittedAt, approvedAt: b.approvedAt, liveAt: b.liveAt, createdAt: b.createdAt,
});
export const toSellerProduct = (p: ProductRec, l: ProductLink, s: Storage) => ({ ...toApiProduct(p, s, true), state: l.state, note: l.note });

/** One order as the seller sees it: only this brand's lines, and what is needed to deliver (no email, no other brands' items). */
export function toSellerOrder(o: OrderRec, mine: Set<string>, s: Storage) {
  const items = o.items.filter((i) => i.productId && mine.has(i.productId));
  return {
    id: o.id, orderNumber: o.orderNumber, status: o.status, createdAt: o.createdAt, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    customer: { name: o.customer.name, phone: o.customer.phone }, address: o.address, notes: o.notes, trackingUrl: o.trackingUrl,
    items: items.map((i) => ({ name: i.name, sku: i.sku, size: i.size, color: i.color, unitPrice: i.unitPrice, qty: i.qty, imageUrl: i.thumbKey ? s.url(i.thumbKey) : null })),
    itemCount: items.reduce((n, i) => n + i.qty, 0), subtotal: items.reduce((n, i) => n + i.qty * i.unitPrice, 0),
  };
}

export function sellerRoutes(app: FastifyInstance, d: {
  brands: BrandStore; catalog: CatalogStore; orders: OrderStore; storage: Storage; images: ImageProcessor; auth: ReturnType<typeof makeAuth>; cfg: Config; alerts: SellerAlerts;
}) {
  const { brands, catalog, orders, storage, images, auth, cfg, alerts } = d;
  const pre = { preHandler: auth.customer };
  const purge = async (keys: (string | null | undefined)[], req: { log: { warn: (o: object, m: string) => void } }) => {
    for (const k of keys) if (k) await storage.delete(k).catch((err) => req.log.warn({ key: k, err: String(err) }, "storage delete failed"));
  };

  /** The signed-in customer's brand, whatever its status. */
  async function myBrand(req: { user?: { id: string } }): Promise<BrandRec> {
    const b = await brands.getByOwner(req.user!.id);
    if (!b) throw notFound("You do not have a seller account yet");
    return b;
  }
  /** Editing needs an approved (active) seller account. */
  async function activeBrand(req: { user?: { id: string } }): Promise<BrandRec> {
    const b = await myBrand(req);
    if (b.status === "pending") throw forbidden("Your seller account is waiting for approval.");
    if (b.status === "rejected") throw forbidden("Your seller application was not approved.");
    if (b.status === "suspended") throw forbidden("Your seller account is suspended. Please contact the store.");
    return b;
  }
  const ownProductIds = async (b: BrandRec, includeArchived = false) =>
    (await brands.productLinks(b.id)).filter((l) => includeArchived || l.state !== "archived").map((l) => l.productId);
  async function ownProduct(req: { user?: { id: string } }, id: string) {
    const b = await activeBrand(req);
    const link = await brands.productLink(id);
    if (!link || link.brandId !== b.id || link.state === "archived") throw notFound("Product not found");
    const p = await catalog.getProduct(id, false); if (!p) throw notFound("Product not found");
    return { b, link, p };
  }

  // ---- account ----
  app.get("/seller/portal", async () => ({ url: cfg.SELLER_PORTAL_URL || null }));
  app.get("/seller/me", pre, async (req) => {
    const b = await brands.getByOwner(req.user!.id);
    return { brand: b ? toSellerBrand(b, storage) : null, user: { fullName: req.user!.fullName, email: req.user!.email } };
  });
  app.post("/seller/apply", { ...pre, config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const body = applyBody.parse(req.body);
    if (await brands.getByOwner(req.user!.id)) throw conflict("You already have a seller application");
    try {
      const b = await brands.create({ ownerId: req.user!.id, ...body });
      void alerts.notifyAdmins("New seller application", `${b.draft.name} (${b.city}) wants to sell on the app.`);
      return reply.status(201).send(toSellerBrand(b, storage));
    } catch (e) { if (e instanceof BrandDuplicateError) throw conflict("You already have a seller application"); throw e; }
  });
  /** A rejected seller can ask again after fixing what the store pointed out. */
  app.post("/seller/reapply", pre, async (req) => {
    const b = await myBrand(req);
    if (b.status !== "rejected") throw conflict("Your application is not rejected");
    const r = (await brands.setStatus(b.id, "pending", null))!;
    void alerts.notifyAdmins("Seller application sent again", `${r.draft.name} has updated its application.`);
    return toSellerBrand(r, storage);
  });

  // ---- brand page (draft) ----
  app.put("/seller/brand", pre, async (req) => {
    const b = await activeBrand(req); const body = contentBody.parse(req.body);
    const own = new Set(await ownProductIds(b));
    const prefix = `brands/${b.id}/m/`;
    const sections: PageSection[] = body.sections.map((x) => {
      const sec = { ...x, id: x.id ?? randomUUID() } as PageSection;
      if (sectionKeys(sec).some((k) => !k.startsWith(prefix))) throw new AppError(400, "BAD_MEDIA", "A picture or video does not belong to your brand. Upload it again.");
      if (sec.type === "products") return { ...sec, productIds: [...new Set(sec.productIds)].filter((id) => own.has(id)) };
      if (sec.type === "banner") return { ...sec, slides: sec.slides.map((sl) => ({ ...sl, productId: sl.productId && own.has(sl.productId) ? sl.productId : null })) };
      return sec;
    });
    if (new Set(sections.map((x) => x.id)).size !== sections.length) throw new AppError(400, "BAD_SECTIONS", "Each section needs its own id");
    const next: PageContent = { name: body.name, tagline: body.tagline, logoKey: b.draft.logoKey, coverKey: b.draft.coverKey, instagram: body.instagram, website: body.website, sections };
    const before = contentKeys(b.draft); const shown = contentKeys(b.live);        // read first: an in-memory store hands out the very object it then updates
    const saved = (await brands.saveDraft(b.id, next))!;
    const keep = new Set([...contentKeys(next), ...shown]);
    await purge(before.filter((k) => !keep.has(k)), req);                // files the seller removed from the draft and the live page does not show
    return toSellerBrand(saved, storage);
  });

  /** Uploads one picture (JPG/PNG/WebP) or one short MP4 for a section. The file is only kept once a saved page uses it. */
  app.post("/seller/brand/media", { ...pre, config: { rateLimit: { max: 40, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = await activeBrand(req);
    const type = z.enum(["image", "video"]).parse((req.query as { type?: string }).type);
    if ((await storage.list(`brands/${b.id}/m/`)).length >= 80) throw conflict("You have uploaded a lot of files. Remove unused pictures or videos from your page first.");
    const file = await (req as any).file(type === "video" ? { limits: { fileSize: MAX_VIDEO_BYTES } } : undefined);
    if (!file) throw new AppError(400, "NO_FILE", "Choose a file to upload");
    const buf: Buffer = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, "TOO_LARGE", type === "video" ? `Video is larger than ${MAX_VIDEO_BYTES / 1024 / 1024} MB. Keep it short (under 30 seconds) or compress it.` : "Image is larger than 8 MB");
    const id = randomUUID();
    if (type === "video") {
      if (!(buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp")) throw new AppError(400, "BAD_VIDEO", "Please upload an MP4 video (H.264).");
      const key = `brands/${b.id}/m/${id}.mp4`; await storage.put(key, buf, "video/mp4");
      return reply.status(201).send({ key, url: storage.url(key) });
    }
    const out = await images.process(buf);
    const key = `brands/${b.id}/m/${id}.webp`; await storage.put(key, out.full, "image/webp");
    return reply.status(201).send({ key, url: storage.url(key) });
  });

  async function setImage(req: any, kind: "logo" | "cover") {
    const b = await activeBrand(req);
    const file = await req.file(); if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
    const buf: Buffer = await file.toBuffer(); if (file.file.truncated) throw new AppError(413, "TOO_LARGE", "Image is larger than 8 MB");
    const out = await images.process(buf);
    const key = `brands/${b.id}/${kind}-${randomUUID()}.webp`;
    await storage.put(key, out.full, "image/webp");
    const field = kind === "logo" ? "logoKey" : "coverKey";
    const old = b.draft[field];
    const saved = await brands.saveDraft(b.id, { ...b.draft, [field]: key });
    if (!saved) { await purge([key], req); throw notFound("Brand not found"); }
    if (old && !contentKeys(b.live).includes(old)) await purge([old], req);       // the live page may still show the old picture until the admin approves
    return { url: storage.url(key) };
  }
  async function clearImage(req: any, kind: "logo" | "cover") {
    const b = await activeBrand(req); const field = kind === "logo" ? "logoKey" : "coverKey"; const old = b.draft[field];
    await brands.saveDraft(b.id, { ...b.draft, [field]: null });
    if (old && !contentKeys(b.live).includes(old)) await purge([old], req);
  }
  app.post("/seller/brand/logo", { ...pre, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => setImage(req, "logo"));
  app.post("/seller/brand/cover", { ...pre, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => setImage(req, "cover"));
  app.delete("/seller/brand/logo", pre, async (req, reply) => { await clearImage(req, "logo"); return reply.status(204).send(); });
  app.delete("/seller/brand/cover", pre, async (req, reply) => { await clearImage(req, "cover"); return reply.status(204).send(); });

  /** Sends the page and every new/changed product to the admin for review. */
  app.post("/seller/brand/submit", { ...pre, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req) => {
    const b = await activeBrand(req);
    if (b.pageStatus === "submitted") throw conflict("Your page is already waiting for review.");
    if (!b.draft.logoKey) throw conflict("Add your brand logo before sending the page for review.");
    const links = (await brands.productLinks(b.id)).filter((l) => l.state !== "archived");
    if (!links.length) throw conflict("Add at least one product before sending the page for review.");
    const todo = links.filter((l) => l.state === "draft" || l.state === "rejected");
    const recs = todo.length ? (await catalog.listProducts({ ids: todo.map((l) => l.productId), publishedOnly: false, sort: "new", page: 1, limit: 200 })).items : [];
    const bad = recs.filter((p) => !p.images.length || !p.variants.length).map((p) => p.name);
    if (bad.length) throw conflict(`Each product needs a photo and at least one size/colour. Fix: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "..." : ""}`);
    const r = (await brands.submitPage(b.id))!;
    void alerts.notifyAdmins("Brand page to review", `${r.draft.name} sent its page for review (${todo.length} new product${todo.length === 1 ? "" : "s"}).`);
    return toSellerBrand(r, storage);
  });

  // ---- products ----
  app.get("/seller/categories", pre, async () => ({ items: (await catalog.listCategories(true)).map((c) => ({ id: c.id, slug: c.slug, name: c.name, parentId: c.parentId })) }));

  app.get("/seller/products", pre, async (req) => {
    const b = await myBrand(req);
    const links = (await brands.productLinks(b.id)).filter((l) => l.state !== "archived");
    if (!links.length) return { items: [] };
    const recs = (await catalog.listProducts({ ids: links.map((l) => l.productId), publishedOnly: false, sort: "new", page: 1, limit: MAX_PRODUCTS_PER_BRAND })).items;
    const byId = new Map(recs.map((p) => [p.id, p]));
    return { items: links.flatMap((l) => { const p = byId.get(l.productId); return p ? [toSellerProduct(p, l, storage)] : []; }) };
  });

  async function categoryOk(id: string) {
    if (!(await catalog.listCategories(true)).some((c) => c.id === id)) throw new AppError(400, "BAD_REQUEST", "Choose a category from the list");
  }
  app.post("/seller/products", { ...pre, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = await activeBrand(req); const body = sellerProductBody.parse(req.body); await categoryOk(body.categoryId);
    if ((await brands.productLinks(b.id)).filter((l) => l.state !== "archived").length >= MAX_PRODUCTS_PER_BRAND) throw conflict(`A brand can have at most ${MAX_PRODUCTS_PER_BRAND} products`);
    const base = `${b.slug.replace(/[^a-z0-9]/g, "").slice(0, 8).toUpperCase() || "BR"}-${randomUUID().slice(0, 6).toUpperCase()}`;
    try {
      const p = await catalog.createProduct({
        sku: base, name: body.name, description: body.description, categoryId: body.categoryId, price: body.price, salePrice: body.salePrice, fabric: body.fabric,
        isPublished: false, isFeatured: false, isNew: false,
        variants: body.variants.map((v, i) => ({ sku: `${base}-${i + 1}`, size: v.size, color: v.color, stock: v.stock })),
      });
      await brands.linkProduct(p.id, b.id);
      return reply.status(201).send(toSellerProduct(p, (await brands.productLink(p.id))!, storage));
    } catch (e) { if (e instanceof DuplicateError) throw conflict("Please try again"); throw e; }
  });
  app.get<{ Params: { id: string } }>("/seller/products/:id", pre, async (req) => {
    const { link, p } = await ownProduct(req, idParam.parse(req.params.id)); return toSellerProduct(p, link, storage);
  });
  app.put<{ Params: { id: string } }>("/seller/products/:id", pre, async (req) => {
    const id = idParam.parse(req.params.id); const { link, p: cur } = await ownProduct(req, id);
    const body = sellerProductBody.parse(req.body); await categoryOk(body.categoryId);
    const have = new Map(cur.variants.map((v) => [v.id, v]));
    const variants = body.variants.map((v) => {
      if (v.id) { const old = have.get(v.id); if (!old) throw new AppError(400, "BAD_REQUEST", "Unknown variant"); return { sku: old.sku, size: v.size, color: v.color, stock: v.stock }; }
      return { sku: `${cur.sku}-${randomUUID().slice(0, 5).toUpperCase()}`, size: v.size, color: v.color, stock: v.stock };
    });
    try {
      // Visibility flags stay exactly as the store set them: a seller can never publish or feature a product.
      const p = (await catalog.updateProduct(id, {
        sku: cur.sku, name: body.name, description: body.description, categoryId: body.categoryId, price: body.price, salePrice: body.salePrice, fabric: body.fabric,
        isPublished: cur.isPublished, isFeatured: cur.isFeatured, isNew: cur.isNew, variants,
      }))!;
      return toSellerProduct(p, link, storage);
    } catch (e) { if (e instanceof DuplicateError) throw conflict("Please try again"); throw e; }
  });
  /** "Delete" hides the product for good but keeps it (past orders still point at it). */
  app.delete<{ Params: { id: string } }>("/seller/products/:id", pre, async (req, reply) => {
    const id = idParam.parse(req.params.id); const { b } = await ownProduct(req, id);
    await catalog.setPublished(id, false); await brands.setProductState(id, "archived", null);
    await brands.saveDraft(b.id, withoutProduct(b.draft, id));
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/seller/products/:id/images", { ...pre, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const id = idParam.parse(req.params.id); const { p } = await ownProduct(req, id);
    if (p.images.length >= MAX_IMAGES_PER_PRODUCT) throw conflict(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`);
    const file = await (req as any).file(); if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
    const buf: Buffer = await file.toBuffer(); if (file.file.truncated) throw new AppError(413, "TOO_LARGE", "Image is larger than 8 MB");
    const out = await images.process(buf);
    const base = `products/${id}/${randomUUID()}`; const keys = { storageKey: `${base}.webp`, thumbKey: `${base}-thumb.webp` };
    await storage.put(keys.storageKey, out.full, "image/webp"); await storage.put(keys.thumbKey, out.thumb, "image/webp");
    const rec = await catalog.addImage(id, { ...keys, width: out.width, height: out.height });
    if (!rec) { await purge([keys.storageKey, keys.thumbKey], req); throw notFound("Product not found"); }
    return reply.status(201).send({ id: rec.id, url: storage.url(rec.storageKey), thumbUrl: storage.url(rec.thumbKey) });
  });
  app.delete<{ Params: { id: string; imageId: string } }>("/seller/products/:id/images/:imageId", pre, async (req, reply) => {
    const id = idParam.parse(req.params.id); const imageId = idParam.parse(req.params.imageId); const { link, p } = await ownProduct(req, id);
    if (link.state === "approved" && p.isPublished && p.images.length <= 1) throw conflict("A live product needs at least one photo. Add another one first.");
    const keys = await catalog.deleteImage(id, imageId); if (!keys) throw notFound("Image not found");
    await purge(keys, req); return reply.status(204).send();
  });
  app.patch<{ Params: { id: string } }>("/seller/products/:id/images/order", pre, async (req) => {
    const id = idParam.parse(req.params.id); await ownProduct(req, id);
    const { imageIds } = z.object({ imageIds: z.array(idParam).max(MAX_IMAGES_PER_PRODUCT) }).parse(req.body);
    if (!(await catalog.reorderImages(id, imageIds))) throw new AppError(400, "BAD_ORDER", "imageIds must list every image of this product exactly once");
    const link = (await brands.productLink(id))!;
    return toSellerProduct((await catalog.getProduct(id, false))!, link, storage);
  });

  // ---- orders for this brand's products ----
  app.get("/seller/orders", pre, async (req) => {
    const b = await myBrand(req);
    if (b.status === "pending" || b.status === "rejected") return { items: [], page: 1, limit: 20, total: 0 };
    const q = z.object({
      status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
      page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    const ids = await ownProductIds(b, true); const mine = new Set(ids);
    const r = await orders.ordersForProducts(ids, { status: q.status as never, page: q.page, limit: q.limit });
    return { items: r.items.map((o) => toSellerOrder(o, mine, storage)), page: q.page, limit: q.limit, total: r.total };
  });
  app.get<{ Params: { id: string } }>("/seller/orders/:id", pre, async (req) => {
    const b = await myBrand(req); const mine = new Set(await ownProductIds(b, true));
    const o = await orders.adminGet(idParam.parse(req.params.id));
    if (!o || !o.items.some((i) => i.productId && mine.has(i.productId))) throw notFound("Order not found");
    return toSellerOrder(o, mine, storage);
  });
}
