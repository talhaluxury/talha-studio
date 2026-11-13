import { randomUUID } from "node:crypto";
import {
  BrandDuplicateError, emptyContent, uniqueBrandSlug,
  type BrandFilter, type BrandRec, type BrandStatus, type BrandStore, type BrandSummary, type BrandTag, type NewBrand, type PageContent, type ProductLink, type ProductState,
} from "./brandStore.js";

/** In-memory BrandStore mirroring PgBrands (used by tests). */
export class MemoryBrands implements BrandStore {
  brands = new Map<string, BrandRec>();
  links = new Map<string, ProductLink>();

  async create(b: NewBrand) {
    if ([...this.brands.values()].some((x) => x.ownerId === b.ownerId)) throw new BrandDuplicateError("owner");
    const now = new Date();
    const rec: BrandRec = {
      id: randomUUID(), ownerId: b.ownerId, slug: uniqueBrandSlug(b.name, new Set([...this.brands.values()].map((x) => x.slug))),
      status: "pending", statusNote: null, pageStatus: "draft", pageNote: null,
      contactPhone: b.contactPhone, city: b.city, businessNote: b.businessNote,
      draft: emptyContent(b.name), live: null, createdAt: now, submittedAt: null, approvedAt: null, liveAt: null,
    };
    this.brands.set(rec.id, rec); return rec;
  }
  async getById(id: string) { return this.brands.get(id) ?? null; }
  async getByOwner(ownerId: string) { return [...this.brands.values()].find((b) => b.ownerId === ownerId) ?? null; }
  async getBySlug(slug: string) { return [...this.brands.values()].find((b) => b.slug === slug) ?? null; }

  private summary(b: BrandRec): BrandSummary {
    const mine = [...this.links.values()].filter((l) => l.brandId === b.id && l.state !== "archived");
    return { ...b, productCount: mine.length, pendingProducts: mine.filter((l) => l.state === "pending").length };
  }
  async list(f: BrandFilter) {
    const q = f.q?.toLowerCase();
    return [...this.brands.values()]
      .filter((b) => (!f.status || b.status === f.status) && (!f.pageStatus || b.pageStatus === f.pageStatus) && (!q || b.draft.name.toLowerCase().includes(q) || b.slug.includes(q)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((b) => this.summary(b));
  }
  async listPublic() {
    return [...this.brands.values()].filter((b) => b.status === "active" && b.live).sort((a, b) => a.live!.name.localeCompare(b.live!.name));
  }
  async saveDraft(id: string, c: PageContent) {
    const b = this.brands.get(id); if (!b) return null;
    b.draft = c;
    if (b.pageStatus === "approved" || b.pageStatus === "submitted") { /* editing after approval keeps the live page; the seller submits again for review */ }
    return b;
  }
  async setStatus(id: string, status: BrandStatus, note: string | null) {
    const b = this.brands.get(id); if (!b) return null;
    b.status = status; b.statusNote = note; return b;
  }
  async submitPage(id: string) {
    const b = this.brands.get(id); if (!b) return null;
    b.pageStatus = "submitted"; b.pageNote = null; b.submittedAt = new Date();
    for (const l of this.links.values()) if (l.brandId === id && (l.state === "draft" || l.state === "rejected")) { l.state = "pending"; l.note = null; }
    return b;
  }
  async approvePage(id: string) {
    const b = this.brands.get(id); if (!b) return null;
    const previousLive = b.live; const now = new Date();
    b.live = structuredClone(b.draft); b.pageStatus = "approved"; b.pageNote = null; b.approvedAt = now; b.liveAt = now;
    const approvedProductIds: string[] = [];
    for (const l of this.links.values()) if (l.brandId === id && l.state === "pending") { l.state = "approved"; l.note = null; approvedProductIds.push(l.productId); }
    return { brand: b, approvedProductIds, previousLive };
  }
  async rejectPage(id: string, note: string) {
    const b = this.brands.get(id); if (!b) return null;
    b.pageStatus = "rejected"; b.pageNote = note;
    for (const l of this.links.values()) if (l.brandId === id && l.state === "pending") { l.state = "rejected"; l.note = note; }
    return b;
  }

  async linkProduct(productId: string, brandId: string) { this.links.set(productId, { productId, brandId, state: "draft", note: null, createdAt: new Date() }); }
  async productLink(productId: string) { return this.links.get(productId) ?? null; }
  async productLinks(brandId: string, states?: ProductState[]) {
    return [...this.links.values()].filter((l) => l.brandId === brandId && (!states || states.includes(l.state))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async setProductState(productId: string, state: ProductState, note: string | null) { const l = this.links.get(productId); if (l) { l.state = state; l.note = note; } }
  async tagsForProducts(productIds: string[]) {
    const out = new Map<string, BrandTag>();
    for (const id of productIds) {
      const l = this.links.get(id); const b = l && this.brands.get(l.brandId); if (!b) continue;
      const c = b.live ?? b.draft; out.set(id, { id: b.id, slug: b.slug, name: c.name, logoKey: c.logoKey, ownerId: b.ownerId });
    }
    return out;
  }
}
