import type pg from "pg";
import type { BannerInput, BannerRec, BannerStore } from "./bannerStore.js";

type Row = Record<string, any>;
const toBanner = (r: Row): BannerRec => ({ id: r.id, title: r.title, subtitle: r.subtitle, ctaLabel: r.cta_label, ctaLink: r.cta_link, imageKey: r.image_key,
  sortOrder: r.sort_order, isActive: r.is_active, startsAt: r.starts_at, endsAt: r.ends_at });

export class PgBanners implements BannerStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async list() { return (await this.q("SELECT * FROM banners ORDER BY sort_order, created_at")).rows.map(toBanner); }
  async live(now: Date) {
    return (await this.q("SELECT * FROM banners WHERE is_active AND (starts_at IS NULL OR starts_at <= $1) AND (ends_at IS NULL OR ends_at >= $1) ORDER BY sort_order, created_at", [now])).rows.map(toBanner);
  }
  async get(id: string) { const r = await this.q("SELECT * FROM banners WHERE id = $1", [id]); return r.rows[0] ? toBanner(r.rows[0]) : null; }
  async create(b: BannerInput) {
    const r = await this.q("INSERT INTO banners (title,subtitle,cta_label,cta_link,sort_order,is_active,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [b.title, b.subtitle, b.ctaLabel, b.ctaLink, b.sortOrder, b.isActive, b.startsAt, b.endsAt]); return toBanner(r.rows[0]);
  }
  async update(id: string, b: BannerInput) {
    const r = await this.q("UPDATE banners SET title=$2,subtitle=$3,cta_label=$4,cta_link=$5,sort_order=$6,is_active=$7,starts_at=$8,ends_at=$9 WHERE id=$1 RETURNING *",
      [id, b.title, b.subtitle, b.ctaLabel, b.ctaLink, b.sortOrder, b.isActive, b.startsAt, b.endsAt]); return r.rows[0] ? toBanner(r.rows[0]) : null;
  }
  async remove(id: string) { const r = await this.q("DELETE FROM banners WHERE id = $1 RETURNING image_key", [id]); return { removed: (r.rowCount ?? 0) > 0, imageKey: r.rows[0]?.image_key ?? null }; }
  async setImage(id: string, key: string | null) {
    const old = await this.q("SELECT image_key FROM banners WHERE id = $1", [id]); if (!old.rowCount) return { ok: false, oldKey: null };
    await this.q("UPDATE banners SET image_key = $2 WHERE id = $1", [id, key]); return { ok: true, oldKey: old.rows[0].image_key };
  }
}
