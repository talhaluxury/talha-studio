import { randomUUID } from "node:crypto";
import type pg from "pg";
import { slugify } from "./catalogStore.js";

/** Slugs that belong to the built-in home sections (and "top" = the banner carousel). */
export const BUILTIN_SECTIONS = ["new-arrivals", "featured", "sale"] as const;
const RESERVED = new Set<string>([...BUILTIN_SECTIONS, "top"]);

export interface SectionRec { id: string; slug: string; title: string; sortOrder: number; isActive: boolean; productIds: string[] }
export interface SectionStore {
  list(activeOnly: boolean): Promise<SectionRec[]>;
  getBySlug(slug: string): Promise<SectionRec | null>;
  create(title: string, sortOrder: number): Promise<SectionRec>;
  update(id: string, p: { title: string; sortOrder: number; isActive: boolean }): Promise<SectionRec | null>;
  setProducts(id: string, productIds: string[]): Promise<SectionRec | null>;
  remove(id: string): Promise<boolean>;
}

const uniqueSlug = (title: string, taken: Set<string>) => {
  const base = slugify(title); let s = RESERVED.has(base) ? `${base}-2` : base, n = 2;
  while (taken.has(s) || RESERVED.has(s)) s = `${base}-${n++}`;
  return s.slice(0, 60);
};

export class MemorySections implements SectionStore {
  rows: SectionRec[] = [];
  private sorted(a: SectionRec[]) { return [...a].sort((x, y) => x.sortOrder - y.sortOrder); }
  async list(activeOnly: boolean) { return this.sorted(this.rows.filter((r) => !activeOnly || r.isActive)); }
  async getBySlug(slug: string) { return this.rows.find((r) => r.slug === slug) ?? null; }
  async create(title: string, sortOrder: number) { const r: SectionRec = { id: randomUUID(), slug: uniqueSlug(title, new Set(this.rows.map((x) => x.slug))), title, sortOrder, isActive: true, productIds: [] }; this.rows.push(r); return r; }
  async update(id: string, p: { title: string; sortOrder: number; isActive: boolean }) { const r = this.rows.find((x) => x.id === id); if (!r) return null; Object.assign(r, p); return r; }
  async setProducts(id: string, productIds: string[]) { const r = this.rows.find((x) => x.id === id); if (!r) return null; r.productIds = [...new Set(productIds)]; return r; }
  async remove(id: string) { const n = this.rows.length; this.rows = this.rows.filter((x) => x.id !== id); return this.rows.length < n; }
}

type Row = Record<string, any>;
export class PgSections implements SectionStore {
  constructor(private pool: pg.Pool) {}
  private async hydrate(rows: Row[]): Promise<SectionRec[]> {
    if (!rows.length) return [];
    const links = (await this.pool.query("SELECT section_id, product_id FROM home_section_products WHERE section_id = ANY($1::uuid[]) ORDER BY sort_order", [rows.map((r) => r.id)])).rows;
    return rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, sortOrder: r.sort_order, isActive: r.is_active, productIds: links.filter((l) => l.section_id === r.id).map((l) => l.product_id) }));
  }
  async list(activeOnly: boolean) { return this.hydrate((await this.pool.query(`SELECT * FROM home_sections ${activeOnly ? "WHERE is_active" : ""} ORDER BY sort_order, created_at`)).rows); }
  async getBySlug(slug: string) { return (await this.hydrate((await this.pool.query("SELECT * FROM home_sections WHERE slug = $1", [slug])).rows))[0] ?? null; }
  async create(title: string, sortOrder: number) {
    const taken = new Set((await this.pool.query("SELECT slug FROM home_sections")).rows.map((r) => r.slug as string));
    const r = await this.pool.query("INSERT INTO home_sections (slug, title, sort_order) VALUES ($1,$2,$3) RETURNING *", [uniqueSlug(title, taken), title, sortOrder]);
    return (await this.hydrate(r.rows))[0]!;
  }
  async update(id: string, p: { title: string; sortOrder: number; isActive: boolean }) {
    const r = await this.pool.query("UPDATE home_sections SET title=$2, sort_order=$3, is_active=$4 WHERE id=$1 RETURNING *", [id, p.title, p.sortOrder, p.isActive]);
    return r.rows[0] ? (await this.hydrate(r.rows))[0]! : null;
  }
  async setProducts(id: string, productIds: string[]) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const ok = await c.query("SELECT 1 FROM home_sections WHERE id = $1", [id]); if (!ok.rowCount) { await c.query("ROLLBACK"); return null; }
      await c.query("DELETE FROM home_section_products WHERE section_id = $1", [id]);
      const ids = [...new Set(productIds)];
      for (let i = 0; i < ids.length; i++) await c.query("INSERT INTO home_section_products (section_id, product_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, ids[i], i]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    return (await this.hydrate((await this.pool.query("SELECT * FROM home_sections WHERE id = $1", [id])).rows))[0] ?? null;
  }
  async remove(id: string) { return ((await this.pool.query("DELETE FROM home_sections WHERE id = $1", [id])).rowCount ?? 0) > 0; }
}
