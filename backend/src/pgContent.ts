import type pg from "pg";
import type { SlideInput, SlideRec, SlideStore, StatusRec, StatusStore } from "./contentStore.js";

type Row = Record<string, any>;
const toSlide = (r: Row): SlideRec => ({ id: r.id, title: r.title, body: r.body, imageKey: r.image_key, sortOrder: r.sort_order, isActive: r.is_active });
const toStatus = (r: Row): StatusRec => ({ id: r.id, imageKey: r.image_key, caption: r.caption, createdAt: r.created_at, expiresAt: r.expires_at });

export class PgSlides implements SlideStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async list() { return (await this.q("SELECT * FROM onboarding_slides ORDER BY sort_order, created_at")).rows.map(toSlide); }
  async live() { return (await this.q("SELECT * FROM onboarding_slides WHERE is_active ORDER BY sort_order, created_at")).rows.map(toSlide); }
  async get(id: string) { const r = await this.q("SELECT * FROM onboarding_slides WHERE id = $1", [id]); return r.rows[0] ? toSlide(r.rows[0]) : null; }
  async create(s: SlideInput) { return toSlide((await this.q("INSERT INTO onboarding_slides (title, body, sort_order, is_active) VALUES ($1,$2,$3,$4) RETURNING *", [s.title, s.body, s.sortOrder, s.isActive])).rows[0]); }
  async update(id: string, s: SlideInput) {
    const r = await this.q("UPDATE onboarding_slides SET title=$2, body=$3, sort_order=$4, is_active=$5 WHERE id=$1 RETURNING *", [id, s.title, s.body, s.sortOrder, s.isActive]);
    return r.rows[0] ? toSlide(r.rows[0]) : null;
  }
  async remove(id: string) { const r = await this.q("DELETE FROM onboarding_slides WHERE id = $1 RETURNING image_key", [id]); return { removed: (r.rowCount ?? 0) > 0, imageKey: r.rows[0]?.image_key ?? null }; }
  async setImage(id: string, key: string | null) {
    const old = await this.q("SELECT image_key FROM onboarding_slides WHERE id = $1", [id]); if (!old.rowCount) return { ok: false, oldKey: null };
    await this.q("UPDATE onboarding_slides SET image_key = $2 WHERE id = $1", [id, key]); return { ok: true, oldKey: old.rows[0].image_key };
  }
}

export class PgStatus implements StatusStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async create(imageKey: string, caption: string | null, createdBy: string | null, expiresAt: Date) {
    return toStatus((await this.q("INSERT INTO status_posts (image_key, caption, created_by, expires_at) VALUES ($1,$2,$3,$4) RETURNING *", [imageKey, caption, createdBy, expiresAt])).rows[0]);
  }
  async live(now: Date) { return (await this.q("SELECT * FROM status_posts WHERE expires_at > $1 ORDER BY created_at DESC", [now])).rows.map(toStatus); }
  async get(id: string) { const r = await this.q("SELECT * FROM status_posts WHERE id = $1", [id]); return r.rows[0] ? toStatus(r.rows[0]) : null; }
  async remove(id: string) { const r = await this.q("DELETE FROM status_posts WHERE id = $1 RETURNING image_key", [id]); return { removed: (r.rowCount ?? 0) > 0, imageKey: r.rows[0]?.image_key ?? null }; }
  async view(id: string, userId: string) { await this.q("INSERT INTO status_views (status_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, userId]); }
  async viewCounts(ids: string[]) {
    if (!ids.length) return new Map<string, number>();
    const r = await this.q("SELECT status_id, count(*)::int AS n FROM status_views WHERE status_id = ANY($1::uuid[]) GROUP BY status_id", [ids]);
    return new Map<string, number>(ids.map((id) => [id, r.rows.find((x) => x.status_id === id)?.n ?? 0]));
  }
  async purgeExpired(now: Date) { return (await this.q("DELETE FROM status_posts WHERE expires_at <= $1 RETURNING image_key", [now])).rows.map((r) => r.image_key as string); }
}
