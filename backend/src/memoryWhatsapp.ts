import { randomUUID } from "node:crypto";
import type { WaContact, WaKind, WaLog, WaStatus, WhatsAppStore } from "./whatsapp.js";

export class MemoryWhatsApp implements WhatsAppStore {
  rows: WaLog[] = [];
  contactRows: WaContact[] = [];
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
  async lastNewArrival(phone: string) {
    const r = [...this.rows].reverse().find((x) => x.kind === "new_arrival" && x.status === "sent" && x.toPhone === phone);
    const productId = r?.refId.split(":")[0];
    return r && productId ? { productId, at: r.createdAt } : null;
  }
  async awaitingAddress(phone: string) {
    const r = [...this.rows].reverse().find((x) => x.kind === "address_fix" && x.status === "sending" && x.toPhone === phone && Date.now() - x.createdAt.getTime() < 86_400_000);
    return r ? { id: r.id, orderId: r.refId.split(":")[0]! } : null;
  }
  async addContacts(phones: string[]) {
    let added = 0; for (const phone of phones) if (!this.contactRows.some((c) => c.phone === phone)) { this.contactRows.push({ id: randomUUID(), phone, name: null, createdAt: new Date() }); added++; }
    return { added, existing: phones.length - added };
  }
  async listContacts() { return [...this.contactRows].reverse(); }
  async deleteContact(id: string) { const n = this.contactRows.length; this.contactRows = this.contactRows.filter((c) => c.id !== id); return this.contactRows.length < n; }
}
