import { randomUUID } from "node:crypto";
import { isLive, type BannerInput, type BannerRec, type BannerStore } from "./bannerStore.js";

export class MemoryBanners implements BannerStore {
  rows: BannerRec[] = [];
  private sorted(r: BannerRec[]) { return [...r].sort((a, b) => a.sortOrder - b.sortOrder); }
  async list() { return this.sorted(this.rows); }
  async live(now: Date) { return this.sorted(this.rows.filter((b) => isLive(b, now))); }
  async get(id: string) { return this.rows.find((b) => b.id === id) ?? null; }
  async create(b: BannerInput) { const r: BannerRec = { id: randomUUID(), imageKey: null, ...b }; this.rows.push(r); return r; }
  async update(id: string, b: BannerInput) { const r = await this.get(id); if (!r) return null; Object.assign(r, b); return r; }
  async remove(id: string) { const r = await this.get(id); if (!r) return { removed: false, imageKey: null }; this.rows = this.rows.filter((x) => x.id !== id); return { removed: true, imageKey: r.imageKey }; }
  async setImage(id: string, key: string | null) { const r = await this.get(id); if (!r) return { ok: false, oldKey: null }; const old = r.imageKey; r.imageKey = key; return { ok: true, oldKey: old }; }
}
