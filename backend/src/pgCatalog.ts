import pg from "pg";
import {
  DuplicateError, InUseError, type VariantLookup, LOW_STOCK_THRESHOLD, slugify,
  type CatalogStore, type Category, type CategoryInput, type ImageRec, type ProductInput, type ProductQuery, type ProductRec, type Variant,
} from "./catalogStore.js";

type Row = Record<string, any>;
const toCat = (r: Row): Category => ({ id: r.id, slug: r.slug, name: r.name, parentId: r.parent_id, imageKey: r.image_key, sortOrder: r.sort_order, isActive: r.is_active });
const SELECT = `SELECT p.*, c.slug AS category_slug, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id`;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export class PgCatalog implements CatalogStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  private dupErr(e: any): unknown {
    return e?.code === "23505" ? new DuplicateError(String(e.constraint ?? "").includes("slug") ? "slug" : "sku") : e;
  }

  async listCategories(activeOnly: boolean) {
    const r = await this.q(`SELECT * FROM categories ${activeOnly ? "WHERE is_active" : ""} ORDER BY sort_order, name`);
    return r.rows.map(toCat);
  }
  async createCategory(c: CategoryInput) {
    try {
      const r = await this.q("INSERT INTO categories (slug,name,parent_id,sort_order,is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *", [c.slug, c.name, c.parentId, c.sortOrder, c.isActive]);
      return toCat(r.rows[0]);
    } catch (e) { throw this.dupErr(e); }
  }
  async updateCategory(id: string, c: CategoryInput) {
    try {
      const r = await this.q("UPDATE categories SET slug=$1,name=$2,parent_id=$3,sort_order=$4,is_active=$5 WHERE id=$6 RETURNING *", [c.slug, c.name, c.parentId, c.sortOrder, c.isActive, id]);
      return r.rows[0] ? toCat(r.rows[0]) : null;
    } catch (e) { throw this.dupErr(e); }
  }
  async deleteCategory(id: string) {
    try { const r = await this.q("DELETE FROM categories WHERE id=$1", [id]); return (r.rowCount ?? 0) > 0; }
    catch (e: any) { if (e?.code === "23503") throw new InUseError(); throw e; }
  }

  private async hydrate(rows: Row[]): Promise<ProductRec[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [vs, is] = await Promise.all([
      this.q("SELECT * FROM product_variants WHERE product_id = ANY($1::uuid[]) ORDER BY sku", [ids]),
      this.q("SELECT * FROM product_images WHERE product_id = ANY($1::uuid[]) ORDER BY sort_order", [ids]),
    ]);
    return rows.map((r) => ({
      id: r.id, sku: r.sku, slug: r.slug, name: r.name, description: r.description, categoryId: r.category_id,
      categorySlug: r.category_slug, categoryName: r.category_name, price: r.price, salePrice: r.sale_price, fabric: r.fabric,
      isPublished: r.is_published, isFeatured: r.is_featured, createdAt: r.created_at,
      variants: vs.rows.filter((v) => v.product_id === r.id).map((v): Variant => ({ id: v.id, sku: v.sku, size: v.size, color: v.color, stock: v.stock })),
      images: is.rows.filter((i) => i.product_id === r.id).map((i): ImageRec => ({ id: i.id, storageKey: i.storage_key, thumbKey: i.thumb_key, width: i.width, height: i.height, sortOrder: i.sort_order })),
    }));
  }

  async listProducts(f: ProductQuery) {
    const w: string[] = []; const v: unknown[] = [];
    const add = (sql: string, val: unknown) => { v.push(val); w.push(sql.replace("?", `$${v.length}`)); };
    if (f.publishedOnly) w.push("p.is_published");
    if (f.ids) add("p.id = ANY(?::uuid[])", f.ids);
    if (f.onSale) w.push("p.sale_price IS NOT NULL");
    if (f.categorySlug) add("c.slug = ?", f.categorySlug);
    if (f.q) { v.push(`%${likeEscape(f.q)}%`); const n = v.length; w.push(`(p.name ILIKE $${n} OR p.sku ILIKE $${n} OR p.description ILIKE $${n})`); }
    if (f.minPrice != null) add("COALESCE(p.sale_price, p.price) >= ?", f.minPrice);
    if (f.maxPrice != null) add("COALESCE(p.sale_price, p.price) <= ?", f.maxPrice);
    if (f.size) add("EXISTS (SELECT 1 FROM product_variants x WHERE x.product_id = p.id AND x.size = ?)", f.size);
    if (f.color) add("EXISTS (SELECT 1 FROM product_variants x WHERE x.product_id = p.id AND lower(x.color) = lower(?))", f.color);
    if (f.inStock) w.push("EXISTS (SELECT 1 FROM product_variants x WHERE x.product_id = p.id AND x.stock > 0)");
    if (f.featured) w.push("p.is_featured");
    const where = w.length ? `WHERE ${w.join(" AND ")}` : "";
    const order = f.sort === "price_asc" ? "COALESCE(p.sale_price, p.price) ASC, p.id" : f.sort === "price_desc" ? "COALESCE(p.sale_price, p.price) DESC, p.id" : "p.created_at DESC, p.id";
    const total = await this.q(`SELECT count(*)::int AS n FROM products p JOIN categories c ON c.id = p.category_id ${where}`, v);
    const rows = await this.q(`${SELECT} ${where} ORDER BY ${order} LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`, v);
    return { items: await this.hydrate(rows.rows), total: total.rows[0].n };
  }
  async getProduct(id: string, publishedOnly: boolean) {
    const r = await this.q(`${SELECT} WHERE p.id = $1 ${publishedOnly ? "AND p.is_published" : ""}`, [id]);
    return (await this.hydrate(r.rows))[0] ?? null;
  }
  async getVariantsByIds(ids: string[]): Promise<VariantLookup[]> {
    const r = await this.q(
      `SELECT v.id, v.sku, v.size, v.color, v.stock, p.id AS pid, p.name, p.price, p.sale_price, p.is_published,
              (SELECT i.thumb_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS thumb_key
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1::uuid[])`, [ids]);
    return r.rows.map((x) => ({ variantId: x.id, sku: x.sku, size: x.size, color: x.color, stock: x.stock,
      product: { id: x.pid, name: x.name, price: x.price, salePrice: x.sale_price, isPublished: x.is_published, thumbKey: x.thumb_key } }));
  }
  async related(p: ProductRec, limit: number) {
    const r = await this.q(`${SELECT} WHERE p.is_published AND p.category_id = $1 AND p.id <> $2 ORDER BY p.created_at DESC LIMIT ${limit}`, [p.categoryId, p.id]);
    return this.hydrate(r.rows);
  }

  private async syncVariants(c: pg.PoolClient, productId: string, vs: ProductInput["variants"]) {
    const skus = vs.map((v) => v.sku);
    await c.query("DELETE FROM product_variants WHERE product_id = $1 AND NOT (sku = ANY($2::text[]))", [productId, skus]);
    for (const x of vs) {
      const r = await c.query(
        `INSERT INTO product_variants (product_id, sku, size, color, stock) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (sku) DO UPDATE SET size = EXCLUDED.size, color = EXCLUDED.color, stock = EXCLUDED.stock WHERE product_variants.product_id = $1`,
        [productId, x.sku, x.size, x.color, x.stock]);
      if (r.rowCount === 0) throw new DuplicateError("sku");      // that variant SKU already belongs to another product
    }
  }
  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
    catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }
  async createProduct(p: ProductInput) {
    try {
      const id = await this.tx(async (c) => {
        const slug = `${slugify(p.name)}-${Math.random().toString(36).slice(2, 8)}`;
        const r = await c.query(
          `INSERT INTO products (sku,slug,name,description,category_id,price,sale_price,fabric,is_published,is_featured)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [p.sku, slug, p.name, p.description, p.categoryId, p.price, p.salePrice, p.fabric, p.isPublished, p.isFeatured]);
        await this.syncVariants(c, r.rows[0].id, p.variants);
        return r.rows[0].id as string;
      });
      return (await this.getProduct(id, false))!;
    } catch (e) { throw this.dupErr(e); }
  }
  async updateProduct(id: string, p: ProductInput) {
    try {
      const ok = await this.tx(async (c) => {
        const r = await c.query(
          `UPDATE products SET sku=$1,name=$2,description=$3,category_id=$4,price=$5,sale_price=$6,fabric=$7,is_published=$8,is_featured=$9,updated_at=now()
           WHERE id=$10`, [p.sku, p.name, p.description, p.categoryId, p.price, p.salePrice, p.fabric, p.isPublished, p.isFeatured, id]);
        if (!r.rowCount) return false;
        await this.syncVariants(c, id, p.variants); return true;
      });
      return ok ? this.getProduct(id, false) : null;
    } catch (e) { throw this.dupErr(e); }
  }
  async setPublished(id: string, v: boolean) {
    const r = await this.q("UPDATE products SET is_published=$1, updated_at=now() WHERE id=$2", [v, id]);
    return r.rowCount ? this.getProduct(id, false) : null;
  }
  async deleteProduct(id: string) {
    const keys = await this.q("SELECT storage_key, thumb_key FROM product_images WHERE product_id = $1", [id]);
    const r = await this.q("DELETE FROM products WHERE id = $1", [id]);
    return r.rowCount ? keys.rows.flatMap((k) => [k.storage_key, k.thumb_key]) : null;
  }

  async addImage(productId: string, i: { storageKey: string; thumbKey: string; width: number; height: number }) {
    const ex = await this.q("SELECT 1 FROM products WHERE id=$1", [productId]); if (!ex.rowCount) return null;
    const r = await this.q(
      `INSERT INTO product_images (product_id, storage_key, thumb_key, width, height, sort_order)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(sort_order)+1,0) FROM product_images WHERE product_id=$1)) RETURNING *`,
      [productId, i.storageKey, i.thumbKey, i.width, i.height]);
    const x = r.rows[0]; return { id: x.id, storageKey: x.storage_key, thumbKey: x.thumb_key, width: x.width, height: x.height, sortOrder: x.sort_order };
  }
  async reorderImages(productId: string, ids: string[]) {
    return this.tx(async (c) => {
      const cur = await c.query("SELECT id FROM product_images WHERE product_id=$1", [productId]);
      const have = new Set(cur.rows.map((r) => r.id));
      if (ids.length !== have.size || !ids.every((i) => have.has(i))) return false;
      for (let n = 0; n < ids.length; n++) await c.query("UPDATE product_images SET sort_order=$1 WHERE id=$2 AND product_id=$3", [n, ids[n], productId]);
      return true;
    });
  }
  async deleteImage(productId: string, imageId: string) {
    return this.tx(async (c) => {
      const r = await c.query("DELETE FROM product_images WHERE id=$1 AND product_id=$2 RETURNING storage_key, thumb_key", [imageId, productId]);
      if (!r.rowCount) return null;
      await c.query(`UPDATE product_images i SET sort_order = s.n FROM (SELECT id, row_number() OVER (ORDER BY sort_order) - 1 AS n FROM product_images WHERE product_id=$1) s WHERE i.id = s.id`, [productId]);
      return [r.rows[0].storage_key, r.rows[0].thumb_key];
    });
  }
  async allImageKeys() {
    const r = await this.q("SELECT storage_key, thumb_key FROM product_images UNION ALL SELECT image_key, image_key FROM categories WHERE image_key IS NOT NULL UNION ALL SELECT image_key, image_key FROM banners WHERE image_key IS NOT NULL");
    return new Set(r.rows.flatMap((x) => [x.storage_key, x.thumb_key]));
  }
  async stats() {
    const r = await this.q(
      `WITH t AS (SELECT p.id, p.is_published, COALESCE(SUM(v.stock),0) AS s FROM products p LEFT JOIN product_variants v ON v.product_id = p.id GROUP BY p.id)
       SELECT count(*)::int AS products, count(*) FILTER (WHERE is_published)::int AS published,
              count(*) FILTER (WHERE s = 0)::int AS out_of_stock,
              count(*) FILTER (WHERE s > 0 AND s <= ${LOW_STOCK_THRESHOLD})::int AS low_stock,
              (SELECT count(*)::int FROM categories) AS categories FROM t`);
    const x = r.rows[0]; return { products: x.products, published: x.published, outOfStock: x.out_of_stock, lowStock: x.low_stock, categories: x.categories };
  }
}
