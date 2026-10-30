import { randomUUID } from "node:crypto";
import type { SlideInput, SlideRec, SlideStore, StatusRec, StatusStore } from "./contentStore.js";

export class MemorySlides implements SlideStore {
  rows: SlideRec[] = [];
  private sorted(r: SlideRec[]) { return [...r].sort((a, b) => a.sortOrder - b.sortOrder); }
  async list() { return this.sorted(this.rows); }
  async live() { return this.sorted(this.rows.filter((s) => s.isActive)); }
  async get(id: string) { return this.rows.find((s) => s.id === id) ?? null; }
  async create(s: SlideInput) { const r: SlideRec = { id: randomUUID(), imageKey: null, ...s }; this.rows.push(r); return r; }
  async update(id: string, s: SlideInput) { const r = await this.get(id); if (!r) return null; Object.assign(r, s); return r; }
  async remove(id: string) { const r = await this.get(id); if (!r) return { removed: false, imageKey: null }; this.rows = this.rows.filter((x) => x.id !== id); return { removed: true, imageKey: r.imageKey }; }
  async setImage(id: string, key: string | null) { const r = await this.get(id); if (!r) return { ok: false, oldKey: null }; const old = r.imageKey; r.imageKey = key; return { ok: true, oldKey: old }; }
}

export class MemoryStatus implements StatusStore {
  rows: StatusRec[] = []; views = new Set<string>(); now = () => new Date();
  async create(imageKey: string, caption: string | null, _by: string | null, expiresAt: Date) { const r: StatusRec = { id: randomUUID(), imageKey, caption, createdAt: this.now(), expiresAt }; this.rows.push(r); return r; }
  async live(now: Date) { return this.rows.filter((s) => s.expiresAt > now).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); }
  async get(id: string) { return this.rows.find((s) => s.id === id) ?? null; }
  async remove(id: string) { const r = await this.get(id); if (!r) return { removed: false, imageKey: null }; this.rows = this.rows.filter((x) => x.id !== id); return { removed: true, imageKey: r.imageKey }; }
  async view(id: string, userId: string) { if (this.rows.some((s) => s.id === id)) this.views.add(`${id}:${userId}`); }
  async viewCounts(ids: string[]) { return new Map(ids.map((id) => [id, [...this.views].filter((v) => v.startsWith(`${id}:`)).length])); }
  async purgeExpired(now: Date) { const gone = this.rows.filter((s) => s.expiresAt <= now); this.rows = this.rows.filter((s) => s.expiresAt > now); return gone.map((s) => s.imageKey); }
}
