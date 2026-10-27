import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../errors.js";
import { totalStock, type CatalogStore, type ProductRec } from "../catalogStore.js";
import type { Storage } from "../storage.js";
import type { Config } from "../config.js";
import { priceCart, type PriceCfg } from "../pricing.js";
import type { BannerStore } from "../bannerStore.js";
import type { CouponStore } from "../couponStore.js";
import type { SettingsStore } from "../settingsStore.js";

export const toApiProduct = (p: ProductRec, s: Storage, admin = false) => ({
  id: p.id, sku: p.sku, slug: p.slug, name: p.name, description: p.description,
  category: { id: p.categoryId, slug: p.categorySlug, name: p.categoryName },
  price: p.price, salePrice: p.salePrice, fabric: p.fabric, isFeatured: p.isFeatured,
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
  ids: z.string().max(2000).transform((v) => v.split(",").filter(Boolean)).pipe(z.array(z.string().uuid()).max(50)).optional(),
  onSale: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Shipping comes from the owner-editable settings; only the COD ceiling stays in server config. */
export async function priceCfgFrom(settings: SettingsStore, cfg: Pick<Config, "MAX_COD_ORDER_PKR">): Promise<PriceCfg> {
  const s = await settings.load();
  return { SHIPPING_FLAT_PKR: s.shipping.flat, FREE_SHIPPING_OVER_PKR: s.shipping.freeOver, MAX_COD_ORDER_PKR: cfg.MAX_COD_ORDER_PKR };
}

export function catalogRoutes(app: FastifyInstance, d: { catalog: CatalogStore; storage: Storage; cfg: Config; settings: SettingsStore; banners: BannerStore; coupons: CouponStore }) {
  const { catalog, storage, cfg, settings, banners, coupons } = d;
  app.get("/categories", async () => ({ items: await catalog.listCategories(true) }));

  app.get("/products", async (req) => {
    const f = productQuery.parse(req.query);
    const r = await catalog.listProducts({ ...f, categorySlug: f.category, publishedOnly: true });
    return { items: r.items.map((p) => toApiProduct(p, storage)), page: f.page, limit: f.limit, total: r.total };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (req) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const p = id.success ? await catalog.getProduct(id.data, true) : null;
    if (!p) throw notFound("Product not found");
    const rel = await catalog.related(p, 6);
    return { ...toApiProduct(p, storage), related: rel.map((x) => toApiProduct(x, storage)) };
  });

  // Home feed. Collections are generated from live catalog data; banners arrive with admin banner management.
  app.get("/home", async () => {
    const base = { publishedOnly: true, sort: "new" as const, page: 1, limit: 10 };
    const [cats, news, featured, sale, live, st] = await Promise.all([
      catalog.listCategories(true), catalog.listProducts(base), catalog.listProducts({ ...base, featured: true }), catalog.listProducts({ ...base, onSale: true }),
      banners.live(new Date()), settings.load(),
    ]);
    const col = (slug: string, title: string, r: { items: Parameters<typeof toApiProduct>[0][] }) => ({ slug, title, products: r.items.map((p) => toApiProduct(p, storage)) });
    return {
      announcement: st.announcement.active && st.announcement.text ? st.announcement.text : null,
      banners: live.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.ctaLabel, ctaLink: b.ctaLink, imageUrl: b.imageKey ? storage.url(b.imageKey) : null })),
      categories: cats,
      collections: [col("new-arrivals", "New Arrivals", news), col("featured", "Featured", featured), col("sale", "On Sale", sale)].filter((c) => c.products.length),
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
