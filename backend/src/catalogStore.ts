export interface Category { id: string; slug: string; name: string; parentId: string | null; imageKey: string | null; sortOrder: number; isActive: boolean }
export interface Variant { id: string; sku: string; size: string | null; color: string | null; stock: number }
export interface ImageRec { id: string; storageKey: string; thumbKey: string; width: number | null; height: number | null; sortOrder: number }
export interface ProductRec {
  id: string; sku: string; slug: string; name: string; description: string;
  categoryId: string; categorySlug: string; categoryName: string;
  price: number; salePrice: number | null; fabric: string | null; isPublished: boolean; isFeatured: boolean;
  variants: Variant[]; images: ImageRec[]; createdAt: Date;
}
export interface VariantInput { sku: string; size: string | null; color: string | null; stock: number }
export interface ProductInput {
  sku: string; name: string; description: string; categoryId: string; price: number; salePrice: number | null;
  fabric: string | null; isPublished: boolean; isFeatured: boolean; variants: VariantInput[];
}
export interface CategoryInput { name: string; slug: string; parentId: string | null; sortOrder: number; isActive: boolean }
export interface ProductQuery {
  publishedOnly: boolean; categorySlug?: string; q?: string; sort: "new" | "price_asc" | "price_desc";
  ids?: string[]; onSale?: boolean; minPrice?: number; maxPrice?: number; size?: string; color?: string; inStock?: boolean; featured?: boolean;
  page: number; limit: number;
}
export interface VariantLookup {
  variantId: string; sku: string; size: string | null; color: string | null; stock: number;
  product: { id: string; name: string; price: number; salePrice: number | null; isPublished: boolean; thumbKey: string | null };
}
export interface CatalogStats { products: number; published: number; outOfStock: number; lowStock: number; categories: number }

export class DuplicateError extends Error { constructor(public field: string) { super(`duplicate ${field}`); } }
export class InUseError extends Error {}

export interface CatalogStore {
  listCategories(activeOnly: boolean): Promise<Category[]>;
  createCategory(c: CategoryInput): Promise<Category>;
  updateCategory(id: string, c: CategoryInput): Promise<Category | null>;
  deleteCategory(id: string): Promise<boolean>;            // throws InUseError when products reference it

  listProducts(q: ProductQuery): Promise<{ items: ProductRec[]; total: number }>;
  getProduct(id: string, publishedOnly: boolean): Promise<ProductRec | null>;
  getVariantsByIds(ids: string[]): Promise<VariantLookup[]>;
  related(product: ProductRec, limit: number): Promise<ProductRec[]>;
  createProduct(p: ProductInput): Promise<ProductRec>;      // throws DuplicateError
  updateProduct(id: string, p: ProductInput): Promise<ProductRec | null>;
  setPublished(id: string, v: boolean): Promise<ProductRec | null>;
  deleteProduct(id: string): Promise<string[] | null>;      // returns storage keys to remove

  addImage(productId: string, i: { storageKey: string; thumbKey: string; width: number; height: number }): Promise<ImageRec | null>;
  reorderImages(productId: string, ids: string[]): Promise<boolean>;
  deleteImage(productId: string, imageId: string): Promise<string[] | null>;
  allImageKeys(): Promise<Set<string>>;
  stats(): Promise<CatalogStats>;
}
export const LOW_STOCK_THRESHOLD = 5;
export const totalStock = (p: { variants: { stock: number }[] }) => p.variants.reduce((a, v) => a + v.stock, 0);
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
