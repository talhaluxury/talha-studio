import type pg from "pg";

export type VideoEntity = "product" | "banner";
/** One short mp4 per product or banner. Kept in its own table so the product/banner stores stay untouched. */
export interface VideoStore {
  getMany(entity: VideoEntity, ids: string[]): Promise<Map<string, string>>;
  /** Saves the new key and returns the old one (to delete from storage). */
  set(entity: VideoEntity, id: string, key: string): Promise<string | null>;
  remove(entity: VideoEntity, id: string): Promise<string | null>;
}

export class MemoryVideos implements VideoStore {
  private m = new Map<string, string>();
  async getMany(entity: VideoEntity, ids: string[]) { const out = new Map<string, string>(); for (const id of ids) { const k = this.m.get(`${entity}:${id}`); if (k) out.set(id, k); } return out; }
  async set(entity: VideoEntity, id: string, key: string) { const old = this.m.get(`${entity}:${id}`) ?? null; this.m.set(`${entity}:${id}`, key); return old; }
  async remove(entity: VideoEntity, id: string) { const old = this.m.get(`${entity}:${id}`) ?? null; this.m.delete(`${entity}:${id}`); return old; }
}

export class PgVideos implements VideoStore {
  constructor(private pool: pg.Pool) {}
  async getMany(entity: VideoEntity, ids: string[]) {
    const out = new Map<string, string>(); if (!ids.length) return out;
    const r = await this.pool.query("SELECT entity_id, video_key FROM media_videos WHERE entity = $1 AND entity_id = ANY($2::uuid[])", [entity, ids]);
    for (const row of r.rows) out.set(row.entity_id, row.video_key); return out;
  }
  async set(entity: VideoEntity, id: string, key: string) {
    const old = await this.pool.query("SELECT video_key FROM media_videos WHERE entity = $1 AND entity_id = $2", [entity, id]);
    await this.pool.query("INSERT INTO media_videos (entity, entity_id, video_key) VALUES ($1,$2,$3) ON CONFLICT (entity, entity_id) DO UPDATE SET video_key = EXCLUDED.video_key, created_at = now()", [entity, id, key]);
    return (old.rows[0]?.video_key as string | undefined) ?? null;
  }
  async remove(entity: VideoEntity, id: string) {
    const r = await this.pool.query("DELETE FROM media_videos WHERE entity = $1 AND entity_id = $2 RETURNING video_key", [entity, id]);
    return (r.rows[0]?.video_key as string | undefined) ?? null;
  }
}
