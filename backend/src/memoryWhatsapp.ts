import { randomUUID } from "node:crypto";
import type { WaKind, WaLog, WaStatus, WhatsAppStore } from "./whatsapp.js";

export class MemoryWhatsApp implements WhatsAppStore {
  rows: WaLog[] = [];
  async claim(kind: WaKind, refId: string, toPhone: string) {
    if (this.rows.some((r) => r.kind === kind && r.refId === refId)) return null;
    const r: WaLog = { id: randomUUID(), kind, refId, toPhone, status: "sending", error: null, createdAt: new Date() }; this.rows.push(r); return r;
  }
  async finish(id: string, status: WaStatus, error: string | null) { const r = this.rows.find((x) => x.id === id); if (r) { r.status = status; r.error = error; } }
  async countRecentTo(toPhone: string, windowMs: number) { return this.rows.filter((r) => r.toPhone === toPhone && Date.now() - r.createdAt.getTime() < windowMs).length; }
  async recent(limit: number) { return [...this.rows].reverse().slice(0, limit); }
}
