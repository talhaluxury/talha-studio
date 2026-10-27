import type pg from "pg";
import type { EmailFilter, EmailLog, EmailStore, NewEmail } from "./emailStore.js";

type Row = Record<string, any>;
const toLog = (r: Row): EmailLog => ({
  id: r.id, orderId: r.order_id, kind: r.kind, toEmail: r.to_email, dedupeKey: r.dedupe_key, status: r.status, attempts: r.attempts, nextAttemptAt: r.next_attempt_at,
  providerMessageId: r.provider_message_id, providerState: r.provider_state, lastError: r.last_error, subject: r.subject, createdAt: r.created_at, sentAt: r.sent_at,
});

export class PgEmailStore implements EmailStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async enqueue(e: NewEmail) {
    const r = await this.q(
      `INSERT INTO email_logs (order_id, kind, to_email, dedupe_key, status, last_error) VALUES ($1,$2,$3,$4,$5::email_status,$6)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [e.orderId, e.kind, e.toEmail, e.dedupeKey, e.failedReason ? "failed" : "queued", e.failedReason ?? null]);
    return (r.rowCount ?? 0) > 0;
  }
  async claimDue(limit: number) {
    const r = await this.q(
      `UPDATE email_logs SET attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes', updated_at = now()
       WHERE id IN (SELECT id FROM email_logs WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
       RETURNING *`, [limit]);
    return r.rows.map(toLog);
  }
  async markSent(id: string, messageId: string | null, subject: string) {
    await this.q("UPDATE email_logs SET status='sent', provider_message_id=$2, provider_state='accepted', subject=$3, sent_at=now(), last_error=NULL, updated_at=now() WHERE id=$1", [id, messageId, subject]);
  }
  async markRetry(id: string, error: string, nextAt: Date) { await this.q("UPDATE email_logs SET last_error=$2, next_attempt_at=$3, updated_at=now() WHERE id=$1", [id, error.slice(0, 500), nextAt]); }
  async markFailed(id: string, error: string) { await this.q("UPDATE email_logs SET status='failed', last_error=$2, updated_at=now() WHERE id=$1", [id, error.slice(0, 500)]); }
  async retry(id: string) {
    const r = await this.q("UPDATE email_logs SET status='queued', attempts=0, next_attempt_at=now(), last_error=NULL, updated_at=now() WHERE id=$1 AND status='failed'", [id]);
    return (r.rowCount ?? 0) > 0;
  }
  async get(id: string) { const r = await this.q("SELECT * FROM email_logs WHERE id=$1", [id]); return r.rows[0] ? toLog(r.rows[0]) : null; }
  async list(f: EmailFilter) {
    const w = f.status ? "WHERE status = $1::email_status" : ""; const v = f.status ? [f.status] : [];
    const [rows, n] = await Promise.all([
      this.q(`SELECT * FROM email_logs ${w} ORDER BY created_at DESC LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`, v),
      this.q(`SELECT count(*)::int AS n FROM email_logs ${w}`, v),
    ]);
    return { items: rows.rows.map(toLog), total: n.rows[0].n };
  }
  async setProviderState(messageId: string, state: string, error?: string) {
    const r = await this.q(
      `UPDATE email_logs SET provider_state = CASE WHEN $2::text = 'delayed' AND provider_state IN ('delivered','bounced','complained') THEN provider_state ELSE $2::text END,
         last_error = COALESCE($3, last_error), updated_at = now() WHERE provider_message_id = $1`, [messageId, state, error ?? null]);
    return (r.rowCount ?? 0) > 0;
  }
  async countRecentTo(email: string, sinceMs: number) {
    const r = await this.q("SELECT count(*)::int AS n FROM email_logs WHERE lower(to_email) = lower($1) AND created_at > now() - ($2::int * interval '1 millisecond')", [email, sinceMs]);
    return r.rows[0].n;
  }
  async counts() {
    const r = await this.q("SELECT count(*) FILTER (WHERE status='queued')::int AS queued, count(*) FILTER (WHERE status='failed')::int AS failed FROM email_logs");
    return r.rows[0];
  }
}
