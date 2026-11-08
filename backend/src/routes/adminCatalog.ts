import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, conflict, notFound } from "../errors.js";
import { DuplicateError, InUseError, slugify, type CatalogStore, type ProductInput } from "../catalogStore.js";
import { MAX_IMAGES_PER_PRODUCT, type ImageProcessor } from "../images.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Storage } from "../storage.js";
import type { VideoStore } from "../videoStore.js";
import { productQuery, toApiCategory, toApiProduct } from "./catalog.js";

const idParam = z.string().uuid();
const nullableText = (max: number) => z.string().trim().max(max).transform((s) => s || null).nullable().optional().transform((v) => v ?? null);

const variant = z.object({
  sku: z.string().trim().regex(/^[A-Za-z0-9\-_]{2,50}$/, "Letters, numbers, - and _ only"),
  size: nullableText(20), color: nullableText(30), stock: z.number().int().min(0).max(100000),
});
const productBody = z.object({
  sku: z.string().trim().regex(/^[A-Za-z0-9\-_]{2,40}$/, "Letters, numbers, - and _ only"),
  name: z.string().trim().min(2).max(160), description: z.string().trim().max(5000).default(""),
  categoryId: z.string().uuid(),
  price: z.number().int().min(1).max(10_000_000),
  salePrice: z.number().int().min(1).nullable().optional().transform((v) => v ?? null),
  fabric: nullableText(60), isPublished: z.boolean().default(false), isFeatured: z.boolean().default(false), isNew: z.boolean().optional(),
  variants: z.array(variant).max(100).default([]),
}).superRefine((p, ctx) => {
  if (p.salePrice != null && p.salePrice >= p.price) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be lower than the price" });
  const seen = new Set<string>();
  p.variants.forEach((v, i) => { const k = v.sku.toLowerCase(); if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate variant SKU" }); seen.add(k); });
});
const categoryBody = z.object({
  name: z.string().trim().min(2).max(60), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/).optional(),
  parentId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  sortOrder: z.number().int().min(0).max(9999).default(0), isActive: z.boolean().default(true),
});

export function adminCatalogRoutes(app: FastifyInstance, d: {
  catalog: CatalogStore; storage: Storage; images: ImageProcessor; auth: ReturnType<typeof makeAuth>; log: (e: Parameters<import("../store.js").Store["logActivity"]>[0]) => Promise<void>; videos: VideoStore;
}) {
  const { catalog, storage, images, auth, log, videos } = d;
  const read = { preHandler: [auth.admin] };
  const write = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };   // staff = read-only on catalog
  const act = (req: any, action: string, entity: string, entityId?: string, meta?: unknown) => log({ adminId: req.user.id, action, entity, entityId, meta, ip: req.ip });
  const dupMsg = (e: unknown) => (e instanceof DuplicateError ? conflict(`That ${e.field} is already in use`) : e);

  async function purge(keys: string[] | null | undefined, req: { log: { warn: (o: object, m: string) => void } }) {
    for (const k of keys ?? []) await storage.delete(k).catch((err) => req.log.warn({ key: k, err: String(err) }, "storage delete failed; run cleanup:orphans"));
  }
  async function assertPublishable(id: string, input: Pick<ProductInput, "variants"> | null) {
    const cur = await catalog.getProduct(id, false);
    const variants = input?.variants ?? cur?.variants ?? [];
    if (!cur?.images.length) throw conflict("Add at least one image before publishing");
    if (!variants.length) throw conflict("Add at least one size/color variant before publishing");
  }

  app.get("/admin/stats", read, async () => catalog.stats());
  app.get("/admin/categories", read, async () => ({ items: (await catalog.listCategories(false)).map((c) => toApiCategory(c, storage)) }));

  /** Categories go one level deep: a main category can hold sub-categories, a sub-category cannot hold more. */
  const checkParent = async (self: string | null, parentId: string | null) => {
    if (!parentId) return;
    const all = await catalog.listCategories(false);
    if (parentId === self) throw new AppError(400, "BAD_REQUEST", "A category cannot be its own parent.");
    const p = all.find((c) => c.id === parentId); if (!p) throw new AppError(400, "BAD_REQUEST", "Parent category not found.");
    if (p.parentId) throw new AppError(400, "BAD_REQUEST", "Sub-categories go one level deep only. Pick a main category as the parent.");
    if (self && all.some((c) => c.parentId === self)) throw new AppError(400, "BAD_REQUEST", "This category has sub-categories, so it cannot become a sub-category itself.");
  };
  app.post("/admin/categories", write, async (req, reply) => {
    const b = categoryBody.parse(req.body); await checkParent(null, b.parentId);
    try {
      const c = await catalog.createCategory({ ...b, slug: b.slug ?? slugify(b.name) });
      await act(req, "category.create", "category", c.id); return reply.status(201).send(c);
    } catch (e) { throw dupMsg(e); }
  });
  app.put<{ Params: { id: string } }>("/admin/categories/:id", write, async (req) => {
    const id = idParam.parse(req.params.id); const b = categoryBody.parse(req.body); await checkParent(id, b.parentId);
    try {
      const c = await catalog.updateCategory(id, { ...b, slug: b.slug ?? slugify(b.name) });
      if (!c) throw notFound("Category not found");
      await act(req, "category.update", "category", id); return c;
    } catch (e) { throw dupMsg(e); }
  });
  app.delete<{ Params: { id: string } }>("/admin/categories/:id", write, async (req, reply) => {
    const id = idParam.parse(req.params.id);
    if ((await catalog.listCategories(false)).some((c) => c.parentId === id)) throw conflict("This category has sub-categories. Move or delete them first.");
    try { if (!(await catalog.deleteCategory(id))) throw notFound("Category not found"); }
    catch (e) { if (e instanceof InUseError) throw conflict("This category still has products. Move or delete them first."); throw e; }
    await act(req, "category.delete", "category", id); return reply.status(204).send();
  });

  // ---- Bulk tools: add up to 15 products at once, change or delete many at once. ----
  const productFrom = (cur: NonNullable<Awaited<ReturnType<CatalogStore["getProduct"]>>>, over: Partial<ProductInput>): ProductInput => ({
    sku: cur.sku, name: cur.name, description: cur.description, categoryId: cur.categoryId, price: cur.price, salePrice: cur.salePrice, fabric: cur.fabric,
    isPublished: cur.isPublished, isFeatured: cur.isFeatured, isNew: cur.isNew, variants: cur.variants.map((v) => ({ sku: v.sku, size: v.size, color: v.color, stock: v.stock })), ...over,
  });
  const bulkRow = z.object({
    name: z.string().trim().min(2).max(160), price: z.number().int().min(1).max(10_000_000),
    salePrice: z.number().int().min(1).nullable().optional().transform((v) => v ?? null),
    description: z.string().trim().max(5000).default(""), fabric: nullableText(60),
    sizes: z.array(z.string().trim().min(1).max(20)).max(20).default([]), stock: z.number().int().min(0).max(100000).default(5),
    isFeatured: z.boolean().default(false), isNew: z.boolean().default(false),
  });
  /** Creates draft products (no pictures yet). The admin page then uploads each product's pictures and publishes. */
  app.post("/admin/products/bulk", write, async (req, reply) => {
    const b = z.object({ categoryId: z.string().uuid(), products: z.array(bulkRow).min(1).max(15) }).parse(req.body);
    b.products.forEach((r, i) => { if (r.salePrice != null && r.salePrice >= r.price) throw new AppError(400, "BAD_ROW", `Row ${i + 1}: the sale price must be lower than the price`); });
    const items: { id: string; name: string; index: number }[] = []; const failed: { index: number; message: string }[] = [];
    for (const [index, r] of b.products.entries()) {
      const sku = `TS-${randomUUID().slice(0, 8).toUpperCase()}`;
      const sizes = [...new Set<string>(r.sizes.map((s: string) => s.trim()))];
      const variants = sizes.length ? sizes.map((s) => ({ sku: `${sku}-${s.toUpperCase().replace(/[^A-Z0-9]/g, "") || "X"}`, size: s, color: null, stock: r.stock })) : [{ sku: `${sku}-OS`, size: null, color: null, stock: r.stock }];
      try {
        const p = await catalog.createProduct({ sku, name: r.name, description: r.description, categoryId: b.categoryId, price: r.price, salePrice: r.salePrice, fabric: r.fabric, isPublished: false, isFeatured: r.isFeatured, isNew: r.isNew, variants });
        items.push({ id: p.id, name: p.name, index });
      } catch (e) { failed.push({ index, message: String((e as Error).message ?? e).slice(0, 200) }); }
    }
    if (items.length) await act(req, "product.bulk.create", "product", undefined, { count: items.length });
    return reply.status(201).send({ items, failed });
  });

  /** Change many products at once: sections (new arrival, featured), sale (discount percent, 0 removes it), category, published or not. */
  app.post("/admin/products/bulk-update", write, async (req) => {
    const b = z.object({
      ids: z.array(idParam).min(1).max(100),
      set: z.object({ isFeatured: z.boolean().optional(), isNew: z.boolean().optional(), isPublished: z.boolean().optional(), categoryId: idParam.optional(), discountPercent: z.number().int().min(0).max(90).optional() })
        .refine((s) => Object.values(s).some((v) => v !== undefined), "Choose what to change"),
    }).parse(req.body);
    let updated = 0; const skipped: { id: string; name: string; reason: string }[] = [];
    for (const id of new Set<string>(b.ids)) {
      const cur = await catalog.getProduct(id, false); if (!cur) { skipped.push({ id, name: "", reason: "Not found" }); continue; }
      const s = b.set; const over: Partial<ProductInput> = {};
      if (s.isFeatured !== undefined) over.isFeatured = s.isFeatured;
      if (s.isNew !== undefined) over.isNew = s.isNew;
      if (s.categoryId) over.categoryId = s.categoryId;
      if (s.isPublished !== undefined) over.isPublished = s.isPublished;
      if (s.discountPercent !== undefined) {
        const sale = s.discountPercent === 0 ? null : Math.max(1, Math.round((cur.price * (100 - s.discountPercent)) / 100));
        if (sale !== null && sale >= cur.price) { skipped.push({ id, name: cur.name, reason: "Discount too small for this price" }); continue; }
        over.salePrice = sale;
      }
      try {
        if (over.isPublished && !cur.isPublished) await assertPublishable(id, null);
        await catalog.updateProduct(id, productFrom(cur, over)); updated++;
      } catch (e) { skipped.push({ id, name: cur.name, reason: e instanceof AppError ? e.message : "Could not update" }); }
    }
    await act(req, "product.bulk.update", "product", undefined, { updated, set: b.set });
    return { updated, skipped };
  });

  app.post("/admin/products/bulk-delete", write, async (req) => {
    const { ids } = z.object({ ids: z.array(idParam).min(1).max(100) }).parse(req.body);
    let deleted = 0;
    for (const id of new Set<string>(ids)) { const keys = await catalog.deleteProduct(id); if (keys) { await purge(keys, req); deleted++; } }
    await act(req, "product.bulk.delete", "product", undefined, { deleted });
    return { deleted };
  });

  // ---- Category picture (shown in the app's category circles) ----
  app.post<{ Params: { id: string } }>("/admin/categories/:id/image", write, async (req) => {
    const id = idParam.parse(req.params.id);
    const file = await req.file(); if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
    const buf = await file.toBuffer(); if (file.file.truncated) throw new AppError(413, "TOO_LARGE", "Image is larger than 8 MB");
    const out = await images.process(buf);
    const key = `categories/${id}/${randomUUID()}.webp`; await storage.put(key, out.full, "image/webp");
    const r = await catalog.setCategoryImage(id, key);
    if (!r) { await purge([key], req); throw notFound("Category not found"); }
    await purge(r.oldKey ? [r.oldKey] : [], req); await act(req, "category.image", "category", id);
    return { imageUrl: storage.url(key) };
  });
  app.delete<{ Params: { id: string } }>("/admin/categories/:id/image", write, async (req, reply) => {
    const id = idParam.parse(req.params.id); const r = await catalog.setCategoryImage(id, null); if (!r) throw notFound("Category not found");
    await purge(r.oldKey ? [r.oldKey] : [], req); await act(req, "category.image.delete", "category", id); return reply.status(204).send();
  });

  app.get("/admin/products", read, async (req) => {
    const f = productQuery.parse(req.query);
    const r = await catalog.listProducts({ ...f, categorySlug: f.category, publishedOnly: false });
    return { items: r.items.map((p) => toApiProduct(p, storage, true)), page: f.page, limit: f.limit, total: r.total };
  });
  app.get<{ Params: { id: string } }>("/admin/products/:id", read, async (req) => {
    const p = await catalog.getProduct(idParam.parse(req.params.id), false);
    if (!p) throw notFound("Product not found");
    const vk = (await videos.getMany("product", [p.id])).get(p.id); return { ...toApiProduct(p, storage, true), videoUrl: vk ? storage.url(vk) : null };
  });

  app.post("/admin/products", write, async (req, reply) => {
    const b = productBody.parse(req.body);
    if (b.isPublished) throw conflict("Create the product first, add images, then publish it");
    try {
      const p = await catalog.createProduct({ ...b, isNew: b.isNew ?? false });
      await act(req, "product.create", "product", p.id, { sku: p.sku, price: p.price });
      return reply.status(201).send(toApiProduct(p, storage, true));
    } catch (e) { throw dupMsg(e); }
  });
  app.put<{ Params: { id: string } }>("/admin/products/:id", write, async (req) => {
    const id = idParam.parse(req.params.id); const b = productBody.parse(req.body);
    const before = await catalog.getProduct(id, false); if (!before) throw notFound("Product not found");
    if (b.isPublished) await assertPublishable(id, b);
    try {
      const p = (await catalog.updateProduct(id, { ...b, isNew: b.isNew ?? before.isNew }))!;
      const priceChanged = before.price !== p.price || before.salePrice !== p.salePrice;
      await act(req, priceChanged ? "product.update.price" : "product.update", "product", id, priceChanged ? { from: [before.price, before.salePrice], to: [p.price, p.salePrice] } : undefined);
      return toApiProduct(p, storage, true);
    } catch (e) { throw dupMsg(e); }
  });
  app.patch<{ Params: { id: string } }>("/admin/products/:id/publish", write, async (req) => {
    const id = idParam.parse(req.params.id); const { isPublished } = z.object({ isPublished: z.boolean() }).parse(req.body);
    if (isPublished) await assertPublishable(id, null);
    const p = await catalog.setPublished(id, isPublished); if (!p) throw notFound("Product not found");
    await act(req, isPublished ? "product.publish" : "product.unpublish", "product", id); return toApiProduct(p, storage, true);
  });
  app.delete<{ Params: { id: string } }>("/admin/products/:id", write, async (req, reply) => {
    const id = idParam.parse(req.params.id);
    const keys = await catalog.deleteProduct(id); if (!keys) throw notFound("Product not found");
    await purge(keys, req); await act(req, "product.delete", "product", id); return reply.status(204).send();
  });

  // Upload: validated by decoding, stripped of metadata, resized, thumbnailed, stored as WebP.
  app.post<{ Params: { id: string } }>("/admin/products/:id/images", write, async (req, reply) => {
    const id = idParam.parse(req.params.id);
    const p = await catalog.getProduct(id, false); if (!p) throw notFound("Product not found");
    if (p.images.length >= MAX_IMAGES_PER_PRODUCT) throw conflict(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`);
    const file = await req.file();
    if (!file) throw new AppError(400, "NO_FILE", "Choose an image to upload");
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, "TOO_LARGE", "Image is larger than 8 MB");
    const out = await images.process(buf);
    const base = `products/${id}/${randomUUID()}`;
    const keys = { storageKey: `${base}.webp`, thumbKey: `${base}-thumb.webp` };
    await storage.put(keys.storageKey, out.full, "image/webp");
    await storage.put(keys.thumbKey, out.thumb, "image/webp");
    const rec = await catalog.addImage(id, { ...keys, width: out.width, height: out.height });
    if (!rec) { await purge([keys.storageKey, keys.thumbKey], req); throw notFound("Product not found"); }
    await act(req, "product.image.add", "product", id);
    return reply.status(201).send({ id: rec.id, url: storage.url(rec.storageKey), thumbUrl: storage.url(rec.thumbKey) });
  });
  app.patch<{ Params: { id: string } }>("/admin/products/:id/images/order", write, async (req) => {
    const id = idParam.parse(req.params.id); const { imageIds } = z.object({ imageIds: z.array(z.string().uuid()).max(MAX_IMAGES_PER_PRODUCT) }).parse(req.body);
    if (!(await catalog.reorderImages(id, imageIds))) throw new AppError(400, "BAD_ORDER", "imageIds must list every image of this product exactly once");
    return toApiProduct((await catalog.getProduct(id, false))!, storage, true);
  });
  app.delete<{ Params: { id: string; imageId: string } }>("/admin/products/:id/images/:imageId", write, async (req, reply) => {
    const id = idParam.parse(req.params.id); const imageId = idParam.parse(req.params.imageId);
    const before = await catalog.getProduct(id, false);
    if (before?.isPublished && before.images.length <= 1) throw conflict("A published product needs at least one image. Unpublish it first.");
    const keys = await catalog.deleteImage(id, imageId); if (!keys) throw notFound("Image not found");
    await purge(keys, req); await act(req, "product.image.delete", "product", id); return reply.status(204).send();
  });
}
