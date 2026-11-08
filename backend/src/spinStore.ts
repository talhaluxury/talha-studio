import type pg from "pg";

/** Remembers each customer's last lucky-wheel spin so the wheel can be used once a day. */
export interface SpinStore {
  lastSpin(userId: string): Promise<Date | null>;
  record(userId: string, percent: number, couponCode: string | null): Promise<void>;
}

export class MemorySpin implements SpinStore {
  private m = new Map<string, Date>();
  async lastSpin(userId: string) { return this.m.get(userId) ?? null; }
  async record(userId: string, _percent: number, _code: string | null) { this.m.set(userId, new Date()); }
}

export class PgSpin implements SpinStore {
  constructor(private pool: pg.Pool) {}
  async lastSpin(userId: string) {
    const r = await this.pool.query("SELECT max(created_at) AS at FROM spin_log WHERE user_id = $1", [userId]);
    return (r.rows[0]?.at as Date | null) ?? null;
  }
  async record(userId: string, percent: number, couponCode: string | null) {
    await this.pool.query("INSERT INTO spin_log (user_id, percent, coupon_code) VALUES ($1,$2,$3)", [userId, percent, couponCode]);
  }
}
