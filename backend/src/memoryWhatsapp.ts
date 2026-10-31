import { randomUUID } from "node:crypto";
import type { WaKind, WaLog, WaStatus, WhatsAppStore } from "./whatsapp.js";

export class MemoryWhatsApp implements WhatsAppStore {
  rows: WaLog[] = [];
  optouts = new Set<string>();
  inbound = new Set<string>();
  async claim(kind: WaKind, refId: string, toPhone: string) {
    if (this.rows.some((r) => r.kind === kind && r.refId === refId)) return null;
    const r: WaLog = { id: randomUUID(), kind, refId, toPhone, status: "sending", error: null, createdAt: new Date() }; this.rows.push(r); return r;
  }
  async finish(id: string, status: WaStatus, error: string | null) { const r = this.rows.find((x) => x.id === id); if (r) { r.status = status; r.error = error; } }
  async countRecentTo(toPhone: string, windowMs: number, kinds?: WaKind[]) { return this.rows.filter((r) => r.toPhone === toPhone && (!kinds || kinds.includes(r.kind)) && Date.now() - r.createdAt.getTime() < windowMs).length; }
  async recent(limit: number) { return [...this.rows].reverse().slice(0, limit); }
  async markInbound(messageId: string) { if (this.inbound.has(messageId)) return false; this.inbound.add(messageId); return true; }
  async setOptOut(phone: string, optedOut: boolean) { if (optedOut) this.optouts.add(phone); else this.optouts.delete(phone); }
  async isOptedOut(phone: string) { return this.optouts.has(phone); }
}
