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
  async countRecentTo(toPhone: string, windowMs: number) {
    return Number((await this.pool.query("SELECT count(*) AS n FROM whatsapp_logs WHERE to_phone = $1 AND created_at > now() - ($2 || ' milliseconds')::interval", [toPhone, String(windowMs)])).rows[0].n);
  }
  async recent(limit: number) { return (await this.pool.query("SELECT * FROM whatsapp_logs ORDER BY created_at DESC LIMIT $1", [limit])).rows.map(toLog); }
}
