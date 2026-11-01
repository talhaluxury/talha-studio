import type pg from "pg";
import type { WaKind, WaLog, WaStatus, WhatsAppStore } from "./whatsapp.js";

const toLog = (r: Record<string, any>): WaLog => ({ id: r.id, kind: r.kind, refId: r.ref_id, toPhone: r.to_phone, status: r.status, error: r.error, createdAt: r.created_at });
export class PgWhatsApp implements WhatsAppStore {
  constructor(private pool: pg.Pool) {}
  async claim(kind: WaKind, refId: string, toPhone: string) {
    const r = await this.pool.query("INSERT INTO whatsapp_logs (kind, ref_id, to_phone) VALUES ($1,$2,$3) ON CONFLICT (kind, ref_id) DO NOTHING RETURNING *", [kind, refId, toPhone]);
    return r.rows[0] ? toLog(r.rows[0]) : null;
  }
  async finish(id: string, status: WaStatus, error: string | null) { await this.pool.query("UPDATE whatsapp_logs SET status = $2, error = $3 WHERE id = $1", [id, status, error]); }
  async countRecentTo(toPhone: string, windowMs: number, kinds?: WaKind[]) {
    return Number((await this.pool.query("SELECT count(*) AS n FROM whatsapp_logs WHERE to_phone = $1 AND created_at > now() - ($2 || ' milliseconds')::interval AND ($3::text[] IS NULL OR kind = ANY($3::text[]))", [toPhone, String(windowMs), kinds ?? null])).rows[0].n);
  }
  async recent(limit: number) { return (await this.pool.query("SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT $1", [limit])).rows.map(toLog); }
  /** Meta retries webhooks: true only the first time a message id is seen. */
  async markInbound(messageId: string) { return (await this.pool.query("INSERT INTO whatsapp_inbound (message_id) VALUES ($1) ON CONFLICT DO NOTHING", [messageId])).rowCount === 1; }
  async setOptOut(phone: string, optedOut: boolean) {
    if (optedOut) await this.pool.query("INSERT INTO whatsapp_optouts (phone) VALUES ($1) ON CONFLICT DO NOTHING", [phone]);
    else await this.pool.query("DELETE FROM whatsapp_optouts WHERE phone = $1", [phone]);
  }
  async isOptedOut(phone: string) { return (await this.pool.query("SELECT 1 FROM whatsapp_optouts WHERE phone = $1", [phone])).rowCount === 1; }
  async lastNewArrival(phone: string) {
    const r = (await this.pool.query("SELECT ref_id, created_at FROM whatsapp_logs WHERE kind = 'new_arrival' AND status = 'sent' AND to_phone = $1 ORDER BY created_at DESC LIMIT 1", [phone])).rows[0];
    const productId = String(r?.ref_id ?? "").split(":")[0];
    return r && productId ? { productId, at: r.created_at as Date } : null;
  }
  async awaitingAddress(phone: string) {
    const r = (await this.pool.query("SELECT id, ref_id FROM whatsapp_logs WHERE kind = 'address_fix' AND status = 'sending' AND to_phone = $1 AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1", [phone])).rows[0];
    return r ? { id: String(r.id), orderId: String(r.ref_id).split(":")[0]! } : null;
  }
  async addContacts(phones: string[]) {
    let added = 0;
    for (const ph of phones) added += (await this.pool.query("INSERT INTO whatsapp_contacts (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING", [ph])).rowCount ?? 0;
    return { added, existing: phones.length - added };
  }
  async listContacts() { return (await this.pool.query("SELECT id, phone, name, created_at FROM whatsapp_contacts ORDER BY created_at DESC")).rows.map((r) => ({ id: String(r.id), phone: String(r.phone), name: (r.name as string | null) ?? null, createdAt: r.created_at as Date })); }
  async deleteContact(id: string) { return ((await this.pool.query("DELETE FROM whatsapp_contacts WHERE id = $1", [id])).rowCount ?? 0) > 0; }
}
