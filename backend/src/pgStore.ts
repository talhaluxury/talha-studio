import pg from "pg";
import type { Address, NewAddress, NewUser, Role, Store, User } from "./store.js";

type Row = Record<string, any>;
const toUser = (r: Row): User => ({
  id: r.id, email: r.email, passwordHash: r.password_hash, googleSub: r.google_sub, fullName: r.full_name,
  phone: r.phone, role: r.role, isActive: r.is_active, deletedAt: r.deleted_at, createdAt: r.created_at,
});
const toAddr = (r: Row): Address => ({
  id: r.id, userId: r.user_id, label: r.label, recipient: r.recipient, phone: r.phone, line1: r.line1,
  line2: r.line2, city: r.city, province: r.province, postalCode: r.postal_code, isDefault: r.is_default,
});

const USER_COLS: Record<string, string> = {
  fullName: "full_name", phone: "phone", googleSub: "google_sub", isActive: "is_active", role: "role", passwordHash: "password_hash",
};
const ADDR_COLS: Record<string, string> = {
  label: "label", recipient: "recipient", phone: "phone", line1: "line1", line2: "line2", city: "city",
  province: "province", postalCode: "postal_code", isDefault: "is_default",
};

/** Builds a safe `SET col = $n` list from a whitelist (column names never come from user input). */
function setClause(patch: Row, map: Record<string, string>, startAt = 1) {
  const keys = Object.keys(patch).filter((k) => k in map && patch[k] !== undefined);
  return { sql: keys.map((k, i) => `${map[k]} = $${i + startAt}`).join(", "), values: keys.map((k) => patch[k]), keys };
}

export class PgStore implements Store {
  private pool: pg.Pool;
  constructor(url: string, extra: Partial<pg.PoolConfig> = {}) { this.pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000, ...extra }); }
  close() { return this.pool.end(); }
  get db() { return this.pool; }
  private q(text: string, values: unknown[] = []) { return this.pool.query(text, values as any[]); }

  async ping() { await this.q("SELECT 1"); }
  async findUserByEmail(email: string) { const r = await this.q("SELECT * FROM users WHERE email = $1", [email]); return r.rows[0] ? toUser(r.rows[0]) : null; }
  async findUserById(id: string) { const r = await this.q("SELECT * FROM users WHERE id = $1", [id]); return r.rows[0] ? toUser(r.rows[0]) : null; }
  async findUserByGoogleSub(sub: string) { const r = await this.q("SELECT * FROM users WHERE google_sub = $1", [sub]); return r.rows[0] ? toUser(r.rows[0]) : null; }
  async createUser(u: NewUser) {
    const r = await this.q(
      "INSERT INTO users (email, password_hash, google_sub, full_name, phone, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [u.email, u.passwordHash, u.googleSub, u.fullName, u.phone, u.role]);
    return toUser(r.rows[0]);
  }
  async updateUser(id: string, patch: Partial<User>) {
    const s = setClause(patch, USER_COLS);
    if (!s.sql) return (await this.findUserById(id))!;
    const r = await this.q(`UPDATE users SET ${s.sql} WHERE id = $${s.values.length + 1} RETURNING *`, [...s.values, id]);
    return toUser(r.rows[0]);
  }
  async anonymiseUser(id: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("DELETE FROM addresses WHERE user_id = $1", [id]);
      await c.query("DELETE FROM device_tokens WHERE user_id = $1", [id]);
      await c.query(
        `UPDATE users SET email = 'deleted+' || id || '@deleted.invalid', full_name = 'Deleted user', phone = NULL,
           password_hash = NULL, google_sub = NULL, is_active = false, deleted_at = now() WHERE id = $1`, [id]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async countCustomers() { const r = await this.q("SELECT count(*)::int AS n FROM users WHERE role = 'customer' AND deleted_at IS NULL"); return r.rows[0].n; }
  async listUsersByRoles(roles: Role[]) { const r = await this.q("SELECT * FROM users WHERE role = ANY($1::user_role[]) ORDER BY created_at", [roles]); return r.rows.map(toUser); }

  async saveRefreshToken(t: { userId: string; tokenHash: string; expiresAt: Date }) {
    await this.q("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)", [t.userId, t.tokenHash, t.expiresAt]);
  }
  async findRefreshToken(h: string) {
    const r = await this.q("SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1", [h]);
    const x = r.rows[0]; return x ? { userId: x.user_id, expiresAt: x.expires_at, revokedAt: x.revoked_at } : null;
  }
  async revokeRefreshToken(h: string) { await this.q("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [h]); }
  async revokeAllRefreshTokens(userId: string) { await this.q("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]); }

  async listAddresses(userId: string) { const r = await this.q("SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id", [userId]); return r.rows.map(toAddr); }
  async createAddress(userId: string, a: NewAddress) {
    if (a.isDefault) await this.q("UPDATE addresses SET is_default = false WHERE user_id = $1", [userId]);
    const r = await this.q(
      `INSERT INTO addresses (user_id,label,recipient,phone,line1,line2,city,province,postal_code,is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [userId, a.label, a.recipient, a.phone, a.line1, a.line2, a.city, a.province, a.postalCode, a.isDefault]);
    return toAddr(r.rows[0]);
  }
  async updateAddress(userId: string, id: string, a: Partial<NewAddress>) {
    if (a.isDefault) await this.q("UPDATE addresses SET is_default = false WHERE user_id = $1", [userId]);
    const s = setClause(a, ADDR_COLS);
    if (!s.sql) { const r = await this.q("SELECT * FROM addresses WHERE id=$1 AND user_id=$2", [id, userId]); return r.rows[0] ? toAddr(r.rows[0]) : null; }
    const n = s.values.length;
    const r = await this.q(`UPDATE addresses SET ${s.sql} WHERE id = $${n + 1} AND user_id = $${n + 2} RETURNING *`, [...s.values, id, userId]);
    return r.rows[0] ? toAddr(r.rows[0]) : null;
  }
  async deleteAddress(userId: string, id: string) { const r = await this.q("DELETE FROM addresses WHERE id=$1 AND user_id=$2", [id, userId]); return (r.rowCount ?? 0) > 0; }

  async listActivity(page: number, limit: number, action?: string) {
    const w = action ? "WHERE a.action LIKE $1" : ""; const v = action ? [action.replace(/[\\%_]/g, (m) => "\\" + m) + "%"] : [];
    const [rows, n] = await Promise.all([
      this.q(`SELECT a.*, u.full_name, u.email FROM admin_activity_logs a LEFT JOIN users u ON u.id = a.admin_id ${w} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, v),
      this.q(`SELECT count(*)::int AS n FROM admin_activity_logs a ${w}`, v)]);
    return { total: n.rows[0].n, items: rows.rows.map((r) => ({ id: r.id, adminName: r.full_name, adminEmail: r.email, action: r.action, entity: r.entity, entityId: r.entity_id, meta: r.meta, ip: r.ip, createdAt: r.created_at })) };
  }
  async logActivity(e: { adminId: string | null; action: string; entity?: string; entityId?: string; meta?: unknown; ip?: string }) {
    await this.q("INSERT INTO admin_activity_logs (admin_id, action, entity, entity_id, meta, ip) VALUES ($1,$2,$3,$4,$5,$6)",
      [e.adminId, e.action, e.entity ?? null, e.entityId ?? null, e.meta ? JSON.stringify(e.meta) : null, e.ip ?? null]);
  }
}
