import type pg from "pg";
import {
  BrandDuplicateError, emptyContent, normalizeContent, uniqueBrandSlug,
  type BrandFilter, type BrandRec, type BrandStatus, type BrandStore, type BrandSummary, type BrandTag, type NewBrand, type PageContent, type ProductLink, type ProductState,
} from "./brandStore.js";

type Row = Record<string, any>;
const toBrand = (r: Row): BrandRec => ({
  id: r.id, ownerId: r.owner_id, slug: r.slug, status: r.status, statusNote: r.status_note, pageStatus: r.page_status, pageNote: r.page_note,
  contactPhone: r.contact_phone, city: r.city, businessNote: r.business_note, draft: normalizeContent(r.draft, r.slug), live: r.live ? normalizeContent(r.live, r.slug) : null,
  createdAt: r.created_at, submittedAt: r.submitted_at, approvedAt: r.approved_at, liveAt: r.live_at,
});
const toLink = (r: Row): ProductLink => ({ productId: r.product_id, brandId: r.brand_id, state: r.state, note: r.note, createdAt: r.created_at });
const json = (v: unknown) => JSON.stringify(v);
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export class PgBrands implements BrandStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
    catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }

  async create(b: NewBrand) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = new Set((await this.q("SELECT slug FROM brands")).rows.map((r) => r.slug as string));
      const slug = uniqueBrandSlug(b.name, taken);
      try {
        const r = await this.q(
          "INSERT INTO brands (owner_id, slug, contact_phone, city, business_note, draft) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *",
          [b.ownerId, slug, b.contactPhone, b.city, b.businessNote, json(emptyContent(b.name))]);
        return toBrand(r.rows[0]);
      } catch (e: any) {
        if (e?.code !== "23505") throw e;
        if (String(e.constraint ?? "").includes("owner")) throw new BrandDuplicateError("owner");
        // slug raced with another application: look again and pick the next free one
      }
    }
    throw new BrandDuplicateError("slug");
  }
  async getById(id: string) { const r = await this.q("SELECT * FROM brands WHERE id = $1", [id]); return r.rows[0] ? toBrand(r.rows[0]) : null; }
  async getByOwner(ownerId: string) { const r = await this.q("SELECT * FROM brands WHERE owner_id = $1", [ownerId]); return r.rows[0] ? toBrand(r.rows[0]) : null; }
  async getBySlug(slug: string) { const r = await this.q("SELECT * FROM brands WHERE slug = $1", [slug]); return r.rows[0] ? toBrand(r.rows[0]) : null; }

  async list(f: BrandFilter): Promise<BrandSummary[]> {
    const w: string[] = []; const v: unknown[] = [];
    if (f.status) { v.push(f.status); w.push(`b.status = $${v.length}`); }
    if (f.pageStatus) { v.push(f.pageStatus); w.push(`b.page_status = $${v.length}`); }
    if (f.q) { v.push(`%${likeEscape(f.q)}%`); w.push(`(b.draft->>'name' ILIKE $${v.length} OR b.slug ILIKE $${v.length})`); }
    const r = await this.q(
      `SELECT b.*,
         (SELECT count(*)::int FROM brand_products p WHERE p.brand_id = b.id AND p.state <> 'archived') AS product_count,
         (SELECT count(*)::int FROM brand_products p WHERE p.brand_id = b.id AND p.state = 'pending') AS pending_products
       FROM brands b ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY b.created_at DESC`, v);
    return r.rows.map((x) => ({ ...toBrand(x), productCount: x.product_count, pendingProducts: x.pending_products }));
  }
  async listPublic() {
    const r = await this.q("SELECT * FROM brands WHERE status = 'active' AND live IS NOT NULL ORDER BY lower(live->>'name')");
    return r.rows.map(toBrand);
  }
  async saveDraft(id: string, c: PageContent) {
    const r = await this.q("UPDATE brands SET draft = $2::jsonb WHERE id = $1 RETURNING *", [id, json(c)]);
    return r.rows[0] ? toBrand(r.rows[0]) : null;
  }
  async setStatus(id: string, status: BrandStatus, note: string | null) {
    const r = await this.q("UPDATE brands SET status = $2, status_note = $3 WHERE id = $1 RETURNING *", [id, status, note]);
    return r.rows[0] ? toBrand(r.rows[0]) : null;
  }
  async submitPage(id: string) {
    return this.tx(async (c) => {
      const r = await c.query("UPDATE brands SET page_status = 'submitted', page_note = NULL, submitted_at = now() WHERE id = $1 RETURNING *", [id]);
      if (!r.rowCount) return null;
      await c.query("UPDATE brand_products SET state = 'pending', note = NULL, updated_at = now() WHERE brand_id = $1 AND state IN ('draft','rejected')", [id]);
      return toBrand(r.rows[0]);
    });
  }
  async approvePage(id: string) {
    return this.tx(async (c) => {
      const cur = await c.query("SELECT * FROM brands WHERE id = $1 FOR UPDATE", [id]);
      if (!cur.rowCount) return null;
      const previousLive = (cur.rows[0].live as PageContent | null) ?? null;
      const r = await c.query("UPDATE brands SET live = draft, page_status = 'approved', page_note = NULL, approved_at = now(), live_at = now() WHERE id = $1 RETURNING *", [id]);
      const p = await c.query("UPDATE brand_products SET state = 'approved', note = NULL, updated_at = now() WHERE brand_id = $1 AND state = 'pending' RETURNING product_id", [id]);
      return { brand: toBrand(r.rows[0]), approvedProductIds: p.rows.map((x) => x.product_id as string), previousLive };
    });
  }
  async rejectPage(id: string, note: string) {
    return this.tx(async (c) => {
      const r = await c.query("UPDATE brands SET page_status = 'rejected', page_note = $2 WHERE id = $1 RETURNING *", [id, note]);
      if (!r.rowCount) return null;
      await c.query("UPDATE brand_products SET state = 'rejected', note = $2, updated_at = now() WHERE brand_id = $1 AND state = 'pending'", [id, note]);
      return toBrand(r.rows[0]);
    });
  }

  async linkProduct(productId: string, brandId: string) {
    await this.q("INSERT INTO brand_products (product_id, brand_id) VALUES ($1,$2) ON CONFLICT (product_id) DO NOTHING", [productId, brandId]);
  }
  async productLink(productId: string) { const r = await this.q("SELECT * FROM brand_products WHERE product_id = $1", [productId]); return r.rows[0] ? toLink(r.rows[0]) : null; }
  async productLinks(brandId: string, states?: ProductState[]) {
    const r = states
      ? await this.q("SELECT * FROM brand_products WHERE brand_id = $1 AND state = ANY($2::text[]) ORDER BY created_at DESC", [brandId, states])
      : await this.q("SELECT * FROM brand_products WHERE brand_id = $1 ORDER BY created_at DESC", [brandId]);
    return r.rows.map(toLink);
  }
  async setProductState(productId: string, state: ProductState, note: string | null) {
    await this.q("UPDATE brand_products SET state = $2, note = $3, updated_at = now() WHERE product_id = $1", [productId, state, note]);
  }
  async tagsForProducts(productIds: string[]) {
    const out = new Map<string, BrandTag>(); if (!productIds.length) return out;
    const r = await this.q(
      `SELECT p.product_id, b.id, b.slug, b.owner_id, COALESCE(b.live, b.draft) AS content
       FROM brand_products p JOIN brands b ON b.id = p.brand_id WHERE p.product_id = ANY($1::uuid[])`, [productIds]);
    for (const x of r.rows) out.set(x.product_id, { id: x.id, slug: x.slug, name: x.content?.name || x.slug, logoKey: x.content?.logoKey ?? null, ownerId: x.owner_id });
    return out;
  }
}
