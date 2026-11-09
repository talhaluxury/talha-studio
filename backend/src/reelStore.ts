import { randomUUID } from "node:crypto";
import type pg from "pg";

export interface ReelRec { id: string; title: string; target: string | null; videoKey: string | null; sortOrder: number; isActive: boolean }
export interface ReelInput { title: string; target: string | null; sortOrder: number; isActive: boolean }

export interface ReelStore {
  list(activeOnly: boolean): Promise<ReelRec[]>;
  get(id: string): Promise<ReelRec | null>;
  create(i: ReelInput): Promise<ReelRec>;
  update(id: string, i: ReelInput): Promise<ReelRec | null>;
  /** Returns the removed reel (so its video file can be deleted), or null when it did not exist. */
  remove(id: string): Promise<ReelRec | null>;
  /** Stores (or clears, with null) the video key. Returns the previous key, or undefined when the reel does not exist. */
  setVideo(id: string, key: string | null): Promise<string | null | undefined>;
}

export class MemoryReels implements ReelStore {
  rows: ReelRec[] = [];
  private sorted(a: ReelRec[]) { return [...a].sort((x, y) => x.sortOrder - y.sortOrder); }
  async list(activeOnly: boolean) { return this.sorted(this.rows.filter((r) => !activeOnly || r.isActive)); }
  async get(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async create(i: ReelInput) { const r: ReelRec = { id: randomUUID(), videoKey: null, ...i }; this.rows.push(r); return r; }
  async update(id: string, i: ReelInput) { const r = this.rows.find((x) => x.id === id); if (!r) return null; Object.assign(r, i); return r; }
  async remove(id: string) { const r = this.rows.find((x) => x.id === id); if (!r) return null; this.rows = this.rows.filter((x) => x.id !== id); return r; }
  async setVideo(id: string, key: string | null) { const r = this.rows.find((x) => x.id === id); if (!r) return undefined; const old = r.videoKey; r.videoKey = key; return old; }
}

const map = (r: any): ReelRec => ({ id: r.id, title: r.title, target: r.target, videoKey: r.video_key, sortOrder: r.sort_order, isActive: r.is_active });
export class PgReels implements ReelStore {
  constructor(private pool: pg.Pool) {}
  async list(activeOnly: boolean) { return (await this.pool.query(`SELECT * FROM reels ${activeOnly ? "WHERE is_active" : ""} ORDER BY sort_order, created_at`)).rows.map(map); }
  async get(id: string) { const r = await this.pool.query("SELECT * FROM reels WHERE id = $1", [id]); return r.rows[0] ? map(r.rows[0]) : null; }
  async create(i: ReelInput) { return map((await this.pool.query("INSERT INTO reels (title, target, sort_order, is_active) VALUES ($1,$2,$3,$4) RETURNING *", [i.title, i.target, i.sortOrder, i.isActive])).rows[0]); }
  async update(id: string, i: ReelInput) { const r = await this.pool.query("UPDATE reels SET title=$2, target=$3, sort_order=$4, is_active=$5 WHERE id=$1 RETURNING *", [id, i.title, i.target, i.sortOrder, i.isActive]); return r.rows[0] ? map(r.rows[0]) : null; }
  async remove(id: string) { const r = await this.pool.query("DELETE FROM reels WHERE id = $1 RETURNING *", [id]); return r.rows[0] ? map(r.rows[0]) : null; }
  async setVideo(id: string, key: string | null) {
    const old = await this.pool.query("SELECT video_key FROM reels WHERE id = $1", [id]); if (!old.rows[0]) return undefined;
    await this.pool.query("UPDATE reels SET video_key = $2 WHERE id = $1", [id, key]); return (old.rows[0].video_key as string | null) ?? null;
  }
}
