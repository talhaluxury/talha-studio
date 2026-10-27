import { randomUUID } from "node:crypto";
import {
  DuplicateError, InUseError, type VariantLookup, LOW_STOCK_THRESHOLD, slugify, totalStock,
  type CatalogStore, type Category, type CategoryInput, type ImageRec, type ProductInput, type ProductQuery, type ProductRec,
} from "./catalogStore.js";

export class MemoryCatalog implements CatalogStore {
  cats = new Map<string, Category>();
  prods = new Map<string, ProductRec>();

  async listCategories(activeOnly: boolean) { return [...this.cats.values()].filter((c) => !activeOnly || c.isActive).sort((a, b) => a.sortOrder - b.sortOrder); }
  async createCategory(c: CategoryInput) {
    if ([...this.cats.values()].some((x) => x.slug === c.slug)) throw new DuplicateError("slug");
    const row: Category = { id: randomUUID(), imageKey: null, ...c }; this.cats.set(row.id, row); return row;
  }
  async updateCategory(id: string, c: CategoryInput) {
    const row = this.cats.get(id); if (!row) return null;
    if ([...this.cats.values()].some((x) => x.slug === c.slug && x.id !== id)) throw new DuplicateError("slug");
    Object.assign(row, c);
    for (const p of this.prods.values()) if (p.categoryId === id) { p.categorySlug = row.slug; p.categoryName = row.name; }
    return row;
  }
  async deleteCategory(id: string) {
    if ([...this.prods.values()].some((p) => p.categoryId === id)) throw new InUseError();
    return this.cats.delete(id);
  }

  private eff = (p: ProductRec) => p.salePrice ?? p.price;
  async listProducts(q: ProductQuery) {
    let r = [...this.prods.values()].filter((p) => !q.publishedOnly || p.isPublished);
    if (q.ids) r = r.filter((p) => q.ids!.includes(p.id));
    if (q.onSale) r = r.filter((p) => p.salePrice != null);
    if (q.categorySlug) r = r.filter((p) => p.categorySlug === q.categorySlug);
    if (q.q) { const n = q.q.toLowerCase(); r = r.filter((p) => p.name.toLowerCase().includes(n) || p.sku.toLowerCase().includes(n) || p.description.toLowerCase().includes(n)); }
    if (q.minPrice != null) r = r.filter((p) => this.eff(p) >= q.minPrice!);
    if (q.maxPrice != null) r = r.filter((p) => this.eff(p) <= q.maxPrice!);
    if (q.size) r = r.filter((p) => p.variants.some((v) => v.size === q.size));
    if (q.color) r = r.filter((p) => p.variants.some((v) => v.color?.toLowerCase() === q.color!.toLowerCase()));
    if (q.inStock) r = r.filter((p) => totalStock(p) > 0);
    if (q.featured) r = r.filter((p) => p.isFeatured);
    r.sort(q.sort === "price_asc" ? (a, b) => this.eff(a) - this.eff(b) : q.sort === "price_desc" ? (a, b) => this.eff(b) - this.eff(a) : (a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items: r.slice((q.page - 1) * q.limit, q.page * q.limit), total: r.length };
  }
  async getProduct(id: string, publishedOnly: boolean) { const p = this.prods.get(id); return p && (!publishedOnly || p.isPublished) ? p : null; }
  /** Synchronous so MemoryOrders can read-and-decrement stock atomically (the DB uses row locks for the same guarantee). */
  lookup(ids: string[]): VariantLookup[] {
    const out: VariantLookup[] = [];
    for (const p of this.prods.values()) for (const v of p.variants) if (ids.includes(v.id))
      out.push({ variantId: v.id, sku: v.sku, size: v.size, color: v.color, stock: v.stock, product: { id: p.id, name: p.name, price: p.price, salePrice: p.salePrice, isPublished: p.isPublished, thumbKey: p.images[0]?.thumbKey ?? null } });
    return out;
  }
  async getVariantsByIds(ids: string[]) { return this.lookup(ids); }
  async related(p: ProductRec, limit: number) { return [...this.prods.values()].filter((x) => x.isPublished && x.categoryId === p.categoryId && x.id !== p.id).slice(0, limit); }

  private build(id: string, p: ProductInput, prev?: ProductRec): ProductRec {
    const cat = this.cats.get(p.categoryId)!;
    return {
      id, sku: p.sku, slug: prev?.slug ?? `${slugify(p.name)}-${id.slice(0, 6)}`, name: p.name, description: p.description,
      categoryId: cat.id, categorySlug: cat.slug, categoryName: cat.name, price: p.price, salePrice: p.salePrice, fabric: p.fabric,
      isPublished: p.isPublished, isFeatured: p.isFeatured,
      variants: p.variants.map((v) => ({ id: prev?.variants.find((x) => x.sku === v.sku)?.id ?? randomUUID(), ...v })),
      images: prev?.images ?? [], createdAt: prev?.createdAt ?? new Date(),
    };
  }
  async createProduct(p: ProductInput) {
    if ([...this.prods.values()].some((x) => x.sku === p.sku)) throw new DuplicateError("sku");
    const row = this.build(randomUUID(), p); this.prods.set(row.id, row); return row;
  }
  async updateProduct(id: string, p: ProductInput) {
    const prev = this.prods.get(id); if (!prev) return null;
    if ([...this.prods.values()].some((x) => x.sku === p.sku && x.id !== id)) throw new DuplicateError("sku");
    const row = this.build(id, p, prev); this.prods.set(id, row); return row;
  }
  async setPublished(id: string, v: boolean) { const p = this.prods.get(id); if (!p) return null; p.isPublished = v; return p; }
  async deleteProduct(id: string) {
    const p = this.prods.get(id); if (!p) return null; this.prods.delete(id);
    return p.images.flatMap((i) => [i.storageKey, i.thumbKey]);
  }
  async addImage(productId: string, i: { storageKey: string; thumbKey: string; width: number; height: number }) {
    const p = this.prods.get(productId); if (!p) return null;
    const rec: ImageRec = { id: randomUUID(), ...i, sortOrder: p.images.length }; p.images.push(rec); return rec;
  }
  async reorderImages(productId: string, ids: string[]) {
    const p = this.prods.get(productId); if (!p) return false;
    if (ids.length !== p.images.length || !p.images.every((i) => ids.includes(i.id))) return false;
    p.images = ids.map((id, n) => ({ ...p.images.find((i) => i.id === id)!, sortOrder: n })); return true;
  }
  async deleteImage(productId: string, imageId: string) {
    const p = this.prods.get(productId); const img = p?.images.find((i) => i.id === imageId); if (!p || !img) return null;
    p.images = p.images.filter((i) => i.id !== imageId).map((i, n) => ({ ...i, sortOrder: n })); return [img.storageKey, img.thumbKey];
  }
  async allImageKeys() { return new Set([...this.prods.values()].flatMap((p) => p.images.flatMap((i) => [i.storageKey, i.thumbKey]))); }
  async stats() {
    const ps = [...this.prods.values()];
    return { products: ps.length, published: ps.filter((p) => p.isPublished).length, outOfStock: ps.filter((p) => totalStock(p) === 0).length,
      lowStock: ps.filter((p) => { const s = totalStock(p); return s > 0 && s <= LOW_STOCK_THRESHOLD; }).length, categories: this.cats.size };
  }
}
