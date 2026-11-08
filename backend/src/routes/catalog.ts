import type { SectionStore } from "../sectionStore.js";
import type { VideoStore } from "../videoStore.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../errors.js";
import { totalStock, type CatalogStore, type Category, type ProductRec } from "../catalogStore.js";
import type { Storage } from "../storage.js";
import type { Config } from "../config.js";
import { priceCart, type PriceCfg } from "../pricing.js";
import type { BannerStore } from "../bannerStore.js";
import type { CouponStore } from "../couponStore.js";
import type { SettingsStore } from "../settingsStore.js";

export const toApiCategory = (c: Category, s: Storage) => ({ ...c, imageUrl: c.imageKey ? s.url(c.imageKey) : null });
export const toApiProduct = (p: ProductRec, s: Storage, admin = false) => ({
  id: p.id, sku: p.sku, slug: p.slug, name: p.name, description: p.description,
  category: { id: p.categoryId, slug: p.categorySlug, name: p.categoryName },
  price: p.price, salePrice: p.salePrice, fabric: p.fabric, isFeatured: p.isFeatured, isNew: p.isNew,
  images: p.images.map((i) => ({ id: i.id, url: s.url(i.storageKey), thumbUrl: s.url(i.thumbKey) })),
  variants: p.variants.map((v) => ({ id: v.id, ...(admin ? { sku: v.sku } : {}), size: v.size, color: v.color, stock: v.stock })),
  inStock: totalStock(p) > 0,
  ...(admin ? { isPublished: p.isPublished, createdAt: p.createdAt } : {}),
});

export const productQuery = z.object({
  category: z.string().max(60).optional(), q: z.string().trim().max(80).optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).default("new"),
  minPrice: z.coerce.number().int().min(0).optional(), maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.string().max(20).optional(), color: z.string().max(30).optional(),
  inStock: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  featured: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  section: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),      // "View all" of a home section: new-arrivals, featured, sale, or an owner-made section
  ids: z.string().max(2000).transform((v) => v.split(",").filter(Boolean)).pipe(z.array(z.string().uuid()).max(50)).optional(),
  onSale: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  newArrival: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Shipping comes from the owner-editable settings; only the COD ceiling stays in server config. */
export async function priceCfgFrom(settings: SettingsStore, cfg: Pick<Config, "MAX_COD_ORDER_PKR">): Promise<PriceCfg> {
  const s = await settings.load();
  return { SHIPPING_FLAT_PKR: s.shipping.flat, FREE_SHIPPING_OVER_PKR: s.shipping.freeOver, MAX_COD_ORDER_PKR: cfg.MAX_COD_ORDER_PKR };
}

export function catalogRoutes(app: FastifyInstance, d: { catalog: CatalogStore; storage: Storage; cfg: Config; settings: SettingsStore; banners: BannerStore; coupons: CouponStore; videos?: VideoStore; sections?: SectionStore }) {
  const { catalog, storage, cfg, settings, banners, coupons, videos, sections } = d;
  /** The product filter behind each home section, so "View all" shows exactly what the section shows. */
  const sectionFilter = async (slug?: string): Promise<{ featured?: boolean; onSale?: boolean; newArrival?: boolean; ids?: string[] }> => {
    if (!slug) return {};
    if (slug === "featured") return { featured: true };
    if (slug === "sale") return { onSale: true };
    if (slug === "new-arrivals") { const pinned = await catalog.listProducts({ publishedOnly: true, sort: "new", page: 1, limit: 1, newArrival: true }); return pinned.total > 0 ? { newArrival: true } : {}; }
    const s = sections ? await sections.getBySlug(slug) : null;
    return { ids: s && s.isActive ? s.productIds : [] };
  };
  app.get("/categories", async () => ({ items: (await catalog.listCategories(true)).map((c) => toApiCategory(c, storage)) }));

  app.get("/products", async (req) => {
    const f = productQuery.parse(req.query);
    const r = await catalog.listProducts({ ...f, ...(await sectionFilter(f.section)), categorySlug: f.category, publishedOnly: true });
    return { items: r.items.map((p) => toApiProduct(p, storage)), page: f.page, limit: f.limit, total: r.total };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const p = id.success ? await catalog.getProduct(id.data, true) : null;
    if (!p) throw notFound("Product not found");
    const rel = await catalog.related(p, 6);
    const vk = videos ? (await videos.getMany("product", [p.id])).get(p.id) : undefined;
    return { ...toApiProduct(p, storage), videoUrl: vk ? storage.url(vk) : null, related: rel.map((x) => toApiProduct(x, storage)) };
  });

  // Sale countdown (admin sets the end time). serverNow lets the app count down correctly even if the phone clock is wrong.
  const saleOf = (st: Awaited<ReturnType<SettingsStore["load"]>>, now: Date) => st.sale.active && st.sale.endsAt && new Date(st.sale.endsAt) > now ? { label: st.sale.label || "Sale ends in", endsAt: st.sale.endsAt } : null;
  app.get("/sale", async () => { const now = new Date(); return { sale: saleOf(await settings.load(), now), serverNow: now.toISOString() }; });

  // Home feed. Collections are generated from live catalog data; banners arrive with admin banner management.
  app.get("/home", async () => {
    const base = { publishedOnly: true, sort: "new" as const, page: 1, limit: 10 };
    const [cats, newest, pinned, featured, sale, live, st] = await Promise.all([
      catalog.listCategories(true), catalog.listProducts(base), catalog.listProducts({ ...base, newArrival: true }), catalog.listProducts({ ...base, featured: true }), catalog.listProducts({ ...base, onSale: true }),
      banners.live(new Date()), settings.load(),
    ]);
    const secs = sections ? await sections.list(true) : [];
    const customCols = await Promise.all(secs.map(async (s) => ({ slug: s.slug, title: s.title, items: s.productIds.length ? (await catalog.listProducts({ ...base, ids: s.productIds })).items : [] })));
    const bv = videos ? await videos.getMany("banner", live.map((b) => b.id)) : new Map<string, string>();
    const known = new Set<string>(["top", "new-arrivals", "featured", "sale", ...secs.map((s) => s.slug)]);      // a banner pointing at a removed section falls back to the top carousel
    const bannerJson = (b: (typeof live)[number]) => ({ id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, ctaLink: b.ctaLink, imageUrl: b.imageKey ? storage.url(b.imageKey) : null, videoUrl: bv.get(b.id) ? storage.url(bv.get(b.id)!) : null });
    const news = pinned.items.length ? pinned : newest;      // products the owner marked as New Arrival, otherwise simply the newest ones
    const col = (slug: string, title: string, r: { items: Parameters<typeof toApiProduct>[0][] }) => ({ slug, title, products: r.items.map((p) => toApiProduct(p, storage)) });
    return {
      announcement: st.announcement.active && st.announcement.text ? st.announcement.text : null,
      sale: saleOf(st, new Date()), serverNow: new Date().toISOString(),
      spin: st.spin.active && st.spin.percents.length > 0,
      banners: live.filter((b) => b.placement === "top" || !known.has(b.placement)).map(bannerJson),
      categories: cats.map((c) => toApiCategory(c, storage)),
      collections: [col("new-arrivals", "New Arrivals", news), col("featured", "Featured", featured), col("sale", "On Sale", sale), ...customCols.map((c) => col(c.slug, c.title, { items: c.items }))]
        .filter((c) => c.products.length).map((c) => ({ ...c, banners: live.filter((b) => b.placement === c.slug).map(bannerJson) })),
    };
  });

  // Server-authoritative cart pricing; order creation runs the exact same priceCart() inside its transaction.
  app.post("/cart/quote", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req) => {
    const b = z.object({
      items: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30),
      couponCode: z.string().trim().toUpperCase().max(20).nullish().transform((v) => v || null),
    }).parse(req.body);
    const found = new Map((await catalog.getVariantsByIds(b.items.map((i) => i.variantId))).map((v) => [v.variantId, v]));
    const rec = b.couponCode ? await coupons.getByCode(b.couponCode) : null;
    const r = priceCart(b.items, found, await priceCfgFrom(settings, cfg), { requested: b.couponCode, rec, now: new Date() });
    return { items: r.lines.map((l) => ({ variantId: l.variantId, productId: l.productId, name: l.name, size: l.size, color: l.color, unitPrice: l.unitPrice, qty: l.qty, imageUrl: l.thumbKey ? storage.url(l.thumbKey) : null })),
      issues: r.issues, subtotal: r.subtotal, discount: r.discount, shipping: r.shipping, total: r.total, couponCode: r.couponCode, currency: "PKR" };
  });
}
