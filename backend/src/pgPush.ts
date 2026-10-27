import type pg from "pg";
import { MAX_DEVICES_PER_USER, type CampaignRec, type NewNotification, type NotificationRec, type Prefs, type PushStore } from "./pushStore.js";

type Row = Record<string, any>;
const toNote = (r: Row): NotificationRec => ({ id: r.id, userId: r.user_id, title: r.title, body: r.body, deepLink: r.deep_link, kind: r.kind, readAt: r.read_at, createdAt: r.created_at });
const toCampaign = (r: Row): CampaignRec => ({ id: r.id, title: r.title, body: r.body, deepLink: r.deep_link, createdBy: r.created_by, sentAt: r.sent_at, recipients: r.recipients, failed: r.failed, createdAt: r.created_at });
const AUDIENCE = `FROM users u LEFT JOIN notification_preferences p ON p.user_id = u.id
  WHERE u.role = 'customer' AND u.is_active AND u.deleted_at IS NULL AND COALESCE(p.promotions, true)`;

export class PgPushStore implements PushStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }

  async upsertDevice(userId: string, token: string, platform: string) {
    await this.q(`INSERT INTO device_tokens (user_id, fcm_token, platform) VALUES ($1,$2,$3)
      ON CONFLICT (fcm_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`, [userId, token, platform]);
    await this.q(`DELETE FROM device_tokens WHERE user_id = $1 AND id NOT IN (SELECT id FROM device_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT ${MAX_DEVICES_PER_USER})`, [userId]);
  }
  async removeDevice(userId: string, token: string) { await this.q("DELETE FROM device_tokens WHERE user_id = $1 AND fcm_token = $2", [userId, token]); }
  async deleteTokens(tokens: string[]) { if (tokens.length) await this.q("DELETE FROM device_tokens WHERE fcm_token = ANY($1::text[])", [tokens]); }
  async pruneStale(days: number) { const r = await this.q("DELETE FROM device_tokens WHERE last_seen_at < now() - ($1::int * interval '1 day')", [days]); return r.rowCount ?? 0; }
  async tokensForUser(userId: string) { const r = await this.q("SELECT fcm_token FROM device_tokens WHERE user_id = $1", [userId]); return r.rows.map((x) => x.fcm_token); }
  async getPrefs(userId: string): Promise<Prefs> {
    const r = await this.q("SELECT order_updates, promotions FROM notification_preferences WHERE user_id = $1", [userId]);
    return r.rows[0] ? { orderUpdates: r.rows[0].order_updates, promotions: r.rows[0].promotions } : { orderUpdates: true, promotions: true };
  }
  async setPrefs(userId: string, p: Partial<Prefs>): Promise<Prefs> {
    const cur = { ...(await this.getPrefs(userId)), ...p };
    await this.q(`INSERT INTO notification_preferences (user_id, order_updates, promotions) VALUES ($1,$2,$3)
      ON CONFLICT (user_id) DO UPDATE SET order_updates = EXCLUDED.order_updates, promotions = EXCLUDED.promotions`, [userId, cur.orderUpdates, cur.promotions]);
    return cur;
  }

  async addNotification(userId: string, n: NewNotification) {
    const r = await this.q("INSERT INTO notifications (user_id, title, body, deep_link, kind) VALUES ($1,$2,$3,$4,$5) RETURNING *", [userId, n.title, n.body, n.deepLink, n.kind]);
    return toNote(r.rows[0]);
  }
  async listNotifications(userId: string, page: number, limit: number) {
    const [rows, c] = await Promise.all([
      this.q(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT ${limit} OFFSET ${(page - 1) * limit}`, [userId]),
      this.q("SELECT count(*)::int AS total, count(*) FILTER (WHERE read_at IS NULL)::int AS unread FROM notifications WHERE user_id = $1", [userId]),
    ]);
    return { items: rows.rows.map(toNote), total: c.rows[0].total, unread: c.rows[0].unread };
  }
  async unreadCount(userId: string) { const r = await this.q("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId]); return r.rows[0].n; }
  async markRead(userId: string, id: string) { const r = await this.q("UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2", [id, userId]); return (r.rowCount ?? 0) > 0; }
  async markAllRead(userId: string) { const r = await this.q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]); return r.rowCount ?? 0; }

  async promoAudience() {
    const [u, d] = await Promise.all([
      this.q(`SELECT count(*)::int AS n ${AUDIENCE}`),
      this.q(`SELECT count(*)::int AS n FROM device_tokens d JOIN users u ON u.id = d.user_id LEFT JOIN notification_preferences p ON p.user_id = u.id
              WHERE u.role = 'customer' AND u.is_active AND u.deleted_at IS NULL AND COALESCE(p.promotions, true)`),
    ]);
    return { users: u.rows[0].n, devices: d.rows[0].n };
  }
  async addPromoInbox(n: { title: string; body: string; deepLink: string | null }) {
    const r = await this.q(`INSERT INTO notifications (user_id, title, body, deep_link, kind) SELECT u.id, $1::text, $2::text, $3::text, 'promo' ${AUDIENCE}`, [n.title, n.body, n.deepLink]);
    return r.rowCount ?? 0;
  }
  async promoTokens() {
    const r = await this.q(`SELECT d.fcm_token FROM device_tokens d JOIN users u ON u.id = d.user_id LEFT JOIN notification_preferences p ON p.user_id = u.id
      WHERE u.role = 'customer' AND u.is_active AND u.deleted_at IS NULL AND COALESCE(p.promotions, true)`);
    return r.rows.map((x) => x.fcm_token);
  }
  async createCampaign(c: { title: string; body: string; deepLink: string | null; createdBy: string }) {
    const r = await this.q("INSERT INTO notification_campaigns (title, body, deep_link, created_by) VALUES ($1,$2,$3,$4) RETURNING *", [c.title, c.body, c.deepLink, c.createdBy]);
    return toCampaign(r.rows[0]);
  }
  async finishCampaign(id: string, r: { recipients: number; failed: number }) { await this.q("UPDATE notification_campaigns SET sent_at = now(), recipients = $2, failed = $3 WHERE id = $1", [id, r.recipients, r.failed]); }
  async listCampaigns(page: number, limit: number) {
    const [rows, n] = await Promise.all([
      this.q(`SELECT * FROM notification_campaigns ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`), this.q("SELECT count(*)::int AS n FROM notification_campaigns")]);
    return { items: rows.rows.map(toCampaign), total: n.rows[0].n };
  }
  async hasRecentCampaign(title: string, body: string, sinceMs: number) {
    const r = await this.q("SELECT 1 FROM notification_campaigns WHERE title = $1 AND body = $2 AND created_at > now() - ($3::int * interval '1 millisecond') LIMIT 1", [title, body, sinceMs]);
    return (r.rowCount ?? 0) > 0;
  }
}
