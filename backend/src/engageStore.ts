import type pg from "pg";
import type { CatalogStore } from "./catalogStore.js";
import { randomUUID } from "node:crypto";

export interface ReviewRec { id: string; productId: string; userId: string; rating: number; body: string; author: string; isHidden: boolean; createdAt: Date }
export interface ReviewSummary { avg: number; count: number }

/** Customer reviews (one per customer and product) and "tell me when it is back in stock" alerts. */
export interface EngageStore {
  listReviews(productId: string, limit: number): Promise<ReviewRec[]>;              // visible ones, newest first
  summary(productId: string): Promise<ReviewSummary>;                                // visible ones only
  myReview(productId: string, userId: string): Promise<ReviewRec | null>;
  upsertReview(r: { productId: string; userId: string; rating: number; body: string; author: string }): Promise<ReviewRec>;
  adminReviews(page: number, limit: number): Promise<{ items: (ReviewRec & { productName: string })[]; total: number }>;
  setHidden(id: string, hidden: boolean): Promise<boolean>;
  deleteReview(id: string): Promise<boolean>;
  alertSet(userId: string, productId: string, on: boolean): Promise<void>;
  alertHas(userId: string, productId: string): Promise<boolean>;
  alertProductIds(): Promise<string[]>;                                              // products somebody is waiting for
  takeAlerts(productId: string): Promise<string[]>;                                  // customer ids waiting for it; the alerts are removed
}

const avgOf = (rs: { rating: number }[]): ReviewSummary => ({ count: rs.length, avg: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : 0 });

export class MemoryEngage implements EngageStore {
  private reviews: ReviewRec[] = []; private alerts = new Set<string>();
  constructor(private catalog?: CatalogStore) {}
  private visible(p: string) { return this.reviews.filter((r) => r.productId === p && !r.isHidden); }
  async listReviews(p: string, limit: number) { return this.visible(p).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit); }
  async summary(p: string) { return avgOf(this.visible(p)); }
  async myReview(p: string, u: string) { return this.reviews.find((r) => r.productId === p && r.userId === u) ?? null; }
  async upsertReview(r: { productId: string; userId: string; rating: number; body: string; author: string }) {
    const cur = this.reviews.find((x) => x.productId === r.productId && x.userId === r.userId);
    if (cur) { cur.rating = r.rating; cur.body = r.body; cur.author = r.author; return cur; }
    const rec: ReviewRec = { id: randomUUID(), ...r, isHidden: false, createdAt: new Date() }; this.reviews.push(rec); return rec;
  }
  async adminReviews(page: number, limit: number) {
    const all = [...this.reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const items = await Promise.all(all.slice((page - 1) * limit, page * limit).map(async (r) => ({ ...r, productName: (await this.catalog?.getProduct(r.productId, false))?.name ?? "Product" })));
    return { items, total: all.length };
  }
  async setHidden(id: string, hidden: boolean) { const r = this.reviews.find((x) => x.id === id); if (!r) return false; r.isHidden = hidden; return true; }
  async deleteReview(id: string) { const n = this.reviews.length; this.reviews = this.reviews.filter((r) => r.id !== id); return this.reviews.length < n; }
  async alertSet(u: string, p: string, on: boolean) { if (on) this.alerts.add(`${u}|${p}`); else this.alerts.delete(`${u}|${p}`); }
  async alertHas(u: string, p: string) { return this.alerts.has(`${u}|${p}`); }
  async alertProductIds() { return [...new Set([...this.alerts].map((k) => k.split("|")[1]!))]; }
  async takeAlerts(p: string) { const out: string[] = []; for (const k of [...this.alerts]) { const [u, pid] = k.split("|"); if (pid === p) { out.push(u!); this.alerts.delete(k); } } return out; }
}

const toReview = (r: any): ReviewRec => ({ id: r.id, productId: r.product_id, userId: r.user_id, rating: r.rating, body: r.body, author: r.author, isHidden: r.is_hidden, createdAt: r.created_at });

export class PgEngage implements EngageStore {
  constructor(private pool: pg.Pool) {}
  async listReviews(p: string, limit: number) { return (await this.pool.query("SELECT * FROM reviews WHERE product_id = $1 AND NOT is_hidden ORDER BY created_at DESC LIMIT $2", [p, limit])).rows.map(toReview); }
  async summary(p: string) { const r = (await this.pool.query("SELECT count(*)::int AS n, COALESCE(round(avg(rating)::numeric, 1), 0)::float AS a FROM reviews WHERE product_id = $1 AND NOT is_hidden", [p])).rows[0]; return { count: r.n, avg: r.a }; }
  async myReview(p: string, u: string) { const r = (await this.pool.query("SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2", [p, u])).rows[0]; return r ? toReview(r) : null; }
  async upsertReview(r: { productId: string; userId: string; rating: number; body: string; author: string }) {
    const x = await this.pool.query(
      `INSERT INTO reviews (product_id, user_id, rating, body, author) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (product_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, author = EXCLUDED.author RETURNING *`, [r.productId, r.userId, r.rating, r.body, r.author]);
    return toReview(x.rows[0]);
  }
  async adminReviews(page: number, limit: number) {
    const [rows, n] = await Promise.all([
      this.pool.query(`SELECT r.*, p.name AS product_name FROM reviews r JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
      this.pool.query("SELECT count(*)::int AS n FROM reviews"),
    ]);
    return { items: rows.rows.map((r: any) => ({ ...toReview(r), productName: r.product_name as string })), total: n.rows[0].n as number };
  }
  async setHidden(id: string, hidden: boolean) { return ((await this.pool.query("UPDATE reviews SET is_hidden = $2 WHERE id = $1", [id, hidden])).rowCount ?? 0) > 0; }
  async deleteReview(id: string) { return ((await this.pool.query("DELETE FROM reviews WHERE id = $1", [id])).rowCount ?? 0) > 0; }
  async alertSet(u: string, p: string, on: boolean) {
    if (on) await this.pool.query("INSERT INTO stock_alerts (user_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [u, p]);
    else await this.pool.query("DELETE FROM stock_alerts WHERE user_id = $1 AND product_id = $2", [u, p]);
  }
  async alertHas(u: string, p: string) { return (await this.pool.query("SELECT 1 FROM stock_alerts WHERE user_id = $1 AND product_id = $2", [u, p])).rowCount === 1; }
  async alertProductIds() { return (await this.pool.query("SELECT DISTINCT product_id FROM stock_alerts")).rows.map((r: any) => r.product_id as string); }
  async takeAlerts(p: string) { return (await this.pool.query("DELETE FROM stock_alerts WHERE product_id = $1 RETURNING user_id", [p])).rows.map((r: any) => r.user_id as string); }
}
