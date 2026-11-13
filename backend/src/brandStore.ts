import { slugify } from "./catalogStore.js";

/**
 * Marketplace brands. The seller ACCOUNT (status) is approved first, then the seller edits a draft page; the admin approves the
 * page (page_status) which copies the draft to `live`. Customers only ever see `live` and only while the account is active.
 */
export type BrandStatus = "pending" | "active" | "rejected" | "suspended";
export type PageStatus = "draft" | "submitted" | "approved" | "rejected";
export type ProductState = "draft" | "pending" | "approved" | "rejected" | "archived";
/** One block of the brand page. Pictures and videos are storage keys, never URLs. The page's colours always follow the app's theme. */
export interface BannerSlide { imageKey: string; title: string; subtitle: string; buttonLabel: string; productId: string | null }
interface SectionBase { id: string; hidden: boolean }
export type PageSection = SectionBase & (
  | { type: "banner"; slides: BannerSlide[] }
  | { type: "video"; videoKey: string; title: string; caption: string; autoplay: boolean }
  | { type: "text"; heading: string; body: string; align: "start" | "center" }
  | { type: "products"; title: string; layout: "grid" | "carousel" | "big"; productIds: string[] }
  | { type: "gallery"; title: string; imageKeys: string[] }
  | { type: "features"; title: string; items: string[] }
  | { type: "spacer"; size: "small" | "medium" | "large" }
);
export const SECTION_TYPES = ["banner", "video", "text", "products", "gallery", "features", "spacer"] as const;
export const MAX_SECTIONS = 20;

/** Everything a seller can design on the page: a header (logo, cover, name, tagline, links) and an ordered list of sections. */
export interface PageContent {
  name: string; tagline: string; logoKey: string | null; coverKey: string | null;
  instagram: string | null; website: string | null; sections: PageSection[];
}
export const emptyContent = (name: string): PageContent => ({ name, tagline: "", logoKey: null, coverKey: null, instagram: null, website: null, sections: [] });

/**
 * Pages saved by an older version of the builder (about / highlights / collections / colour style, no `sections`) are converted
 * when they are read, so an old row can never crash the app or the admin site.
 */
export const normalizeContent = (raw: any, fallbackName = ""): PageContent => {
  const c = raw && typeof raw === "object" ? raw : {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const key = (v: unknown) => (typeof v === "string" && v ? v : null);
  let sections: PageSection[] = Array.isArray(c.sections) ? c.sections.filter((s: any) => s && typeof s === "object" && typeof s.id === "string" && (SECTION_TYPES as readonly string[]).includes(s.type)) : [];
  if (!Array.isArray(c.sections)) {
    const legacy: PageSection[] = [];
    if (str(c.about).trim()) legacy.push({ id: "legacy-about", hidden: false, type: "text", heading: "About", body: str(c.about), align: "start" });
    const hl = Array.isArray(c.highlights) ? c.highlights.filter((x: unknown) => typeof x === "string" && x) : [];
    if (hl.length) legacy.push({ id: "legacy-highlights", hidden: false, type: "features", title: "", items: hl.slice(0, 6) });
    (Array.isArray(c.collections) ? c.collections : []).slice(0, 6).forEach((col: any, i: number) => {
      if (col && typeof col.title === "string") legacy.push({ id: `legacy-col-${i}`, hidden: false, type: "products", title: col.title, layout: "grid", productIds: Array.isArray(col.productIds) ? col.productIds.filter((x: unknown) => typeof x === "string") : [] });
    });
    sections = legacy;
  }
  return { name: str(c.name) || fallbackName, tagline: str(c.tagline), logoKey: key(c.logoKey), coverKey: key(c.coverKey), instagram: key(c.instagram), website: key(c.website), sections: sections.slice(0, MAX_SECTIONS) };
};

export const sectionKeys = (s: PageSection): string[] => {
  switch (s.type) {
    case "banner": return s.slides.map((x) => x.imageKey);
    case "video": return [s.videoKey];
    case "gallery": return s.imageKeys;
    default: return [];
  }
};
/** Every stored file the page uses (so replaced ones can be deleted once nothing shows them). */
export const contentKeys = (c: PageContent | null): string[] =>
  c ? [c.logoKey, c.coverKey, ...c.sections.flatMap(sectionKeys)].filter((k): k is string => !!k) : [];
/** The page without a product that was deleted (it also leaves banner buttons and product lists). */
export const withoutProduct = (c: PageContent, productId: string): PageContent => ({
  ...c,
  sections: c.sections.map((s) =>
    s.type === "products" ? { ...s, productIds: s.productIds.filter((x) => x !== productId) }
    : s.type === "banner" ? { ...s, slides: s.slides.map((x) => (x.productId === productId ? { ...x, productId: null } : x)) }
    : s),
});

export interface BrandRec {
  id: string; ownerId: string; slug: string;
  status: BrandStatus; statusNote: string | null; pageStatus: PageStatus; pageNote: string | null;
  contactPhone: string; city: string; businessNote: string;
  draft: PageContent; live: PageContent | null;
  createdAt: Date; submittedAt: Date | null; approvedAt: Date | null; liveAt: Date | null;
}
export interface BrandSummary extends BrandRec { productCount: number; pendingProducts: number }
export interface ProductLink { productId: string; brandId: string; state: ProductState; note: string | null; createdAt: Date }
/** What other parts of the app need to label a product with its brand (product page, admin orders). */
export interface BrandTag { id: string; slug: string; name: string; logoKey: string | null; ownerId: string }
export interface BrandFilter { status?: BrandStatus; pageStatus?: PageStatus; q?: string }
export interface NewBrand { ownerId: string; name: string; contactPhone: string; city: string; businessNote: string }

export class BrandDuplicateError extends Error { constructor(public field: "owner" | "slug") { super(`duplicate ${field}`); } }

export interface BrandStore {
  create(b: NewBrand): Promise<BrandRec>;                         // throws BrandDuplicateError("owner") when this account already has a brand
  getById(id: string): Promise<BrandRec | null>;
  getByOwner(ownerId: string): Promise<BrandRec | null>;
  getBySlug(slug: string): Promise<BrandRec | null>;
  list(f: BrandFilter): Promise<BrandSummary[]>;
  /** Brands customers can see: account active and a page has been approved. Sorted by name. */
  listPublic(): Promise<BrandRec[]>;
  saveDraft(id: string, c: PageContent): Promise<BrandRec | null>;
  setStatus(id: string, status: BrandStatus, note: string | null): Promise<BrandRec | null>;
  /** Marks the page as waiting for review and moves the seller's draft/rejected products to pending. */
  submitPage(id: string): Promise<BrandRec | null>;
  /** Copies draft to live and moves pending products to approved. Returns the brand and the products that just became approved. */
  approvePage(id: string): Promise<{ brand: BrandRec; approvedProductIds: string[]; previousLive: PageContent | null } | null>;
  /** Page and its pending products go back to the seller with a note. */
  rejectPage(id: string, note: string): Promise<BrandRec | null>;

  linkProduct(productId: string, brandId: string): Promise<void>;
  productLink(productId: string): Promise<ProductLink | null>;
  productLinks(brandId: string, states?: ProductState[]): Promise<ProductLink[]>;
  setProductState(productId: string, state: ProductState, note: string | null): Promise<void>;
  /** Which brand owns each product (products without a brand are absent from the map). Uses the live page name/logo when there is one. */
  tagsForProducts(productIds: string[]): Promise<Map<string, BrandTag>>;
}

export const uniqueBrandSlug = (name: string, taken: Set<string>) => {
  const base = slugify(name); let s = base, n = 2;
  while (taken.has(s)) s = `${base.slice(0, 54)}-${n++}`;
  return s;
};
