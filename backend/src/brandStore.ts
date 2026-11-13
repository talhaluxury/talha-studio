import { slugify } from "./catalogStore.js";

/**
 * Marketplace brands. The seller ACCOUNT (status) is approved first, then the seller edits a draft page; the admin approves the
 * page (page_status) which copies the draft to `live`. Customers only ever see `live` and only while the account is active.
 */
export type BrandStatus = "pending" | "active" | "rejected" | "suspended";
export type PageStatus = "draft" | "submitted" | "approved" | "rejected";
export type ProductState = "draft" | "pending" | "approved" | "rejected" | "archived";
export const BRAND_STYLES = ["noir", "ivory", "gold"] as const;
export type BrandStyle = (typeof BRAND_STYLES)[number];

export interface BrandCollection { id: string; title: string; productIds: string[] }
/** Everything a seller can design on the page. Image fields are storage keys, never URLs. */
export interface PageContent {
  name: string; tagline: string; about: string; style: BrandStyle; accent: string;
  logoKey: string | null; coverKey: string | null; highlights: string[];
  instagram: string | null; website: string | null; collections: BrandCollection[];
}
export const emptyContent = (name: string): PageContent => ({
  name, tagline: "", about: "", style: "noir", accent: "#B99A62", logoKey: null, coverKey: null, highlights: [], instagram: null, website: null, collections: [],
});
export const contentKeys = (c: PageContent | null): string[] => (c ? [c.logoKey, c.coverKey].filter((k): k is string => !!k) : []);

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
