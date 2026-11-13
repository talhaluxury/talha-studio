import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { contentKeys, type BrandRec, type BrandStatus, type BrandStore, type PageContent, type PageStatus } from "../brandStore.js";
import type { CatalogStore } from "../catalogStore.js";
import { conflict, notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SellerAlerts } from "../sellerNotify.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";
import { toApiProduct } from "./catalog.js";
import { toApiContent, toSellerProduct } from "./seller.js";

const idParam = z.string().uuid();
const note = z.string().trim().min(3, "Write a short reason for the seller").max(300);

/** Public card for the brands row on the app home. */
const toCard = (b: BrandRec, c: PageContent, s: Storage) => ({
  id: b.id, slug: b.slug, name: c.name, tagline: c.tagline,
  logoUrl: c.logoKey ? s.url(c.logoKey) : null, coverUrl: c.coverKey ? s.url(c.coverKey) : null,
});

/** Customers: the brands row and a brand's own page. Only the approved (live) version is ever shown, and only while the account is active. */
export function brandRoutes(app: FastifyInstance, d: { brands: BrandStore; catalog: CatalogStore; storage: Storage }) {
  const { brands, catalog, storage } = d;

  app.get("/brands", async () => ({ items: (await brands.listPublic()).map((b) => toCard(b, b.live!, storage)) }));

  app.get<{ Params: { slug: string } }>("/brands/:slug", async (req) => {
    const slug = z.string().regex(/^[a-z0-9-]{1,60}$/).safeParse(req.params.slug);
    const b = slug.success ? await brands.getBySlug(slug.data) : null;
    if (!b || b.status !== "active" || !b.live) throw notFound("Brand not found");
    const approved = (await brands.productLinks(b.id, ["approved"])).map((l) => l.productId);
    const recs = approved.length ? (await catalog.listProducts({ ids: approved, publishedOnly: true, sort: "new", page: 1, limit: 100 })).items : [];
    const byId = new Map(recs.map((p) => [p.id, toApiProduct(p, storage)]));
    // Sections are resolved for the app: product lists become real products (an empty list means "all products"), hidden sections are left out.
    const pick = (ids: string[]) => (ids.length ? ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) : [...byId.values()].slice(0, 12));
    const sections = b.live.sections.filter((x) => !x.hidden).flatMap((x): object[] => {
      const base = { id: x.id, type: x.type };
      switch (x.type) {
        case "banner": return [{ ...base, slides: x.slides.map((sl) => ({ imageUrl: storage.url(sl.imageKey), title: sl.title, subtitle: sl.subtitle, buttonLabel: sl.buttonLabel, productId: sl.productId && byId.has(sl.productId) ? sl.productId : null })) }];
        case "video": return [{ ...base, videoUrl: storage.url(x.videoKey), title: x.title, caption: x.caption, autoplay: x.autoplay }];
        case "text": return [{ ...base, heading: x.heading, body: x.body, align: x.align }];
        case "products": { const products = pick(x.productIds); return products.length ? [{ ...base, title: x.title, layout: x.layout, products }] : []; }
        case "gallery": return [{ ...base, title: x.title, images: x.imageKeys.map((k) => ({ url: storage.url(k) })) }];
        case "features": return [{ ...base, title: x.title, items: x.items }];
        case "spacer": return [{ ...base, size: x.size }];
      }
    });
    return {
      brand: { ...toCard(b, b.live, storage), instagram: b.live.instagram, website: b.live.website, productCount: recs.length },
      sections, products: [...byId.values()],
    };
  });
}

/** Admin panel: review seller applications, brand pages and products. Reading is for staff, deciding is for admin/owner. */
export function adminBrandRoutes(app: FastifyInstance, d: {
  brands: BrandStore; catalog: CatalogStore; storage: Storage; store: Store; auth: ReturnType<typeof makeAuth>; alerts: SellerAlerts;
}) {
  const { brands, catalog, storage, store, auth, alerts } = d;
  const read = { preHandler: [auth.admin] };
  const write = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const act = (req: any, action: string, id: string, meta?: unknown) => store.logActivity({ adminId: req.user.id, action, entity: "brand", entityId: id, meta, ip: req.ip });
  const purge = async (keys: string[], req: { log: { warn: (o: object, m: string) => void } }) => {
    for (const k of keys) await storage.delete(k).catch((err) => req.log.warn({ key: k, err: String(err) }, "storage delete failed"));
  };
  const get = async (id: string) => { const b = await brands.getById(idParam.parse(id)); if (!b) throw notFound("Brand not found"); return b; };
  const owner = async (b: BrandRec) => { const u = await store.findUserById(b.ownerId); return { id: b.ownerId, fullName: u?.fullName ?? "", email: u?.email ?? "", phone: u?.phone ?? null }; };

  async function publishable(id: string) {
    const p = await catalog.getProduct(id, false);
    return !!p && p.images.length > 0 && p.variants.length > 0;
  }

  app.get("/admin/brands", read, async (req) => {
    const q = z.object({
      status: z.enum(["pending", "active", "rejected", "suspended"]).optional(),
      pageStatus: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
      q: z.string().trim().max(60).optional(),
    }).parse(req.query);
    const rows = await brands.list(q as { status?: BrandStatus; pageStatus?: PageStatus; q?: string });
    const items = await Promise.all(rows.map(async (b) => ({
      id: b.id, slug: b.slug, name: b.draft.name, status: b.status, pageStatus: b.pageStatus, city: b.city, contactPhone: b.contactPhone,
      logoUrl: (b.live ?? b.draft).logoKey ? storage.url((b.live ?? b.draft).logoKey!) : null,
      productCount: b.productCount, pendingProducts: b.pendingProducts, createdAt: b.createdAt, submittedAt: b.submittedAt, owner: await owner(b),
    })));
    return { items };
  });

  app.get<{ Params: { id: string } }>("/admin/brands/:id", read, async (req) => {
    const b = await get(req.params.id);
    const links = (await brands.productLinks(b.id)).filter((l) => l.state !== "archived");
    const recs = links.length ? (await catalog.listProducts({ ids: links.map((l) => l.productId), publishedOnly: false, sort: "new", page: 1, limit: 200 })).items : [];
    const byId = new Map(recs.map((p) => [p.id, p]));
    return {
      id: b.id, slug: b.slug, status: b.status, statusNote: b.statusNote, pageStatus: b.pageStatus, pageNote: b.pageNote,
      contactPhone: b.contactPhone, city: b.city, businessNote: b.businessNote, owner: await owner(b),
      draft: toApiContent(b.draft, storage), live: b.live ? toApiContent(b.live, storage) : null,
      createdAt: b.createdAt, submittedAt: b.submittedAt, approvedAt: b.approvedAt, liveAt: b.liveAt,
      products: links.flatMap((l) => { const p = byId.get(l.productId); return p ? [toSellerProduct(p, l, storage)] : []; }),
    };
  });

  // ---- seller account ----
  app.post<{ Params: { id: string } }>("/admin/brands/:id/approve", write, async (req) => {
    const b = await get(req.params.id);
    if (b.status !== "pending" && b.status !== "rejected") throw conflict("This account is already approved or suspended");
    const r = (await brands.setStatus(b.id, "active", null))!;
    await act(req, "brand.approve", b.id, { name: r.draft.name });
    void alerts.notifyOwner(b.ownerId, "Seller account approved", `${r.draft.name} is approved. Open your seller page to build your brand page and add products.`);
    return { status: r.status };
  });
  app.post<{ Params: { id: string } }>("/admin/brands/:id/reject", write, async (req) => {
    const b = await get(req.params.id); const body = z.object({ note }).parse(req.body);
    if (b.status === "active") throw conflict("Suspend the account instead");
    const r = (await brands.setStatus(b.id, "rejected", body.note))!;
    await act(req, "brand.reject", b.id, { note: body.note });
    void alerts.notifyOwner(b.ownerId, "Seller application not approved", body.note);
    return { status: r.status };
  });
  /** Suspending takes the brand off the app and hides all of its products; lifting it puts the approved ones back. */
  app.post<{ Params: { id: string } }>("/admin/brands/:id/suspend", write, async (req) => {
    const b = await get(req.params.id); const body = z.object({ note }).parse(req.body);
    if (b.status !== "active") throw conflict("Only an active account can be suspended");
    await brands.setStatus(b.id, "suspended", body.note);
    for (const l of await brands.productLinks(b.id, ["approved"])) await catalog.setPublished(l.productId, false);
    await act(req, "brand.suspend", b.id, { note: body.note });
    void alerts.notifyOwner(b.ownerId, "Seller account suspended", body.note);
    return { status: "suspended" };
  });
  app.post<{ Params: { id: string } }>("/admin/brands/:id/unsuspend", write, async (req) => {
    const b = await get(req.params.id);
    if (b.status !== "suspended") throw conflict("This account is not suspended");
    await brands.setStatus(b.id, "active", null);
    for (const l of await brands.productLinks(b.id, ["approved"])) if (await publishable(l.productId)) await catalog.setPublished(l.productId, true);
    await act(req, "brand.unsuspend", b.id);
    void alerts.notifyOwner(b.ownerId, "Seller account active again", "Your brand page and products are visible in the app again.");
    return { status: "active" };
  });

  // ---- brand page + products ----
  app.post<{ Params: { id: string } }>("/admin/brands/:id/page/approve", write, async (req) => {
    const b = await get(req.params.id);
    if (b.status !== "active") throw conflict("Approve the seller account first");
    if (b.pageStatus !== "submitted") throw conflict("This page is not waiting for review");
    const r = (await brands.approvePage(b.id))!;
    let published = 0; let skipped = 0;
    for (const pid of r.approvedProductIds) {
      if (await publishable(pid)) { await catalog.setPublished(pid, true); published++; }
      else { await brands.setProductState(pid, "rejected", "Needs at least one photo and one size/colour."); skipped++; }
    }
    const still = new Set(contentKeys(r.brand.live));
    await purge(contentKeys(r.previousLive).filter((k) => !still.has(k)), req);          // pictures the seller replaced are no longer needed
    await act(req, "brand.page.approve", b.id, { published, skipped });
    void alerts.notifyOwner(b.ownerId, "Your brand page is live 🎉", `${r.brand.draft.name} is now visible to customers in the app (${published} product${published === 1 ? "" : "s"} published).`);
    return { pageStatus: r.brand.pageStatus, published, skipped };
  });
  app.post<{ Params: { id: string } }>("/admin/brands/:id/page/reject", write, async (req) => {
    const b = await get(req.params.id); const body = z.object({ note }).parse(req.body);
    if (b.pageStatus !== "submitted") throw conflict("This page is not waiting for review");
    const r = (await brands.rejectPage(b.id, body.note))!;
    await act(req, "brand.page.reject", b.id, { note: body.note });
    void alerts.notifyOwner(b.ownerId, "Brand page needs changes", body.note);
    return { pageStatus: r.pageStatus };
  });
  /** Turn down (or take down) a single product without touching the rest. */
  app.post<{ Params: { id: string; productId: string } }>("/admin/brands/:id/products/:productId/reject", write, async (req) => {
    const b = await get(req.params.id); const pid = idParam.parse(req.params.productId); const body = z.object({ note }).parse(req.body);
    const link = await brands.productLink(pid); if (!link || link.brandId !== b.id) throw notFound("Product not found");
    await catalog.setPublished(pid, false); await brands.setProductState(pid, "rejected", body.note);
    await act(req, "brand.product.reject", b.id, { productId: pid, note: body.note });
    void alerts.notifyOwner(b.ownerId, "A product was not approved", body.note);
    return { state: "rejected" };
  });
}
