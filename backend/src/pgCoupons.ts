import type pg from "pg";
import { DuplicateCoupon, type CouponInput, type CouponRec, type CouponStore } from "./couponStore.js";

type Row = Record<string, any>;
export const toCoupon = (r: Row): CouponRec => ({ id: r.id, code: r.code, type: r.type, value: r.value, minSubtotal: r.min_subtotal, maxUses: r.max_uses, usedCount: r.used_count,
  startsAt: r.starts_at, endsAt: r.ends_at, isActive: r.is_active, createdAt: r.created_at });

export class PgCoupons implements CouponStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async list(page: number, limit: number) {
    const [rows, n] = await Promise.all([this.q(`SELECT * FROM coupons ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`), this.q("SELECT count(*)::int AS n FROM coupons")]);
    return { items: rows.rows.map(toCoupon), total: n.rows[0].n };
  }
  async get(id: string) { const r = await this.q("SELECT * FROM coupons WHERE id = $1", [id]); return r.rows[0] ? toCoupon(r.rows[0]) : null; }
  async getByCode(code: string) { const r = await this.q("SELECT * FROM coupons WHERE code = $1", [code]); return r.rows[0] ? toCoupon(r.rows[0]) : null; }
  async create(c: CouponInput) {
    try {
      const r = await this.q("INSERT INTO coupons (code,type,value,min_subtotal,max_uses,starts_at,ends_at,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [c.code, c.type, c.value, c.minSubtotal, c.maxUses, c.startsAt, c.endsAt, c.isActive]);
      return toCoupon(r.rows[0]);
    } catch (e: any) { throw e?.code === "23505" ? new DuplicateCoupon() : e; }
  }
  async update(id: string, c: CouponInput) {
    try {
      const r = await this.q("UPDATE coupons SET code=$2,type=$3,value=$4,min_subtotal=$5,max_uses=$6,starts_at=$7,ends_at=$8,is_active=$9 WHERE id=$1 RETURNING *",
        [id, c.code, c.type, c.value, c.minSubtotal, c.maxUses, c.startsAt, c.endsAt, c.isActive]);
      return r.rows[0] ? toCoupon(r.rows[0]) : null;
    } catch (e: any) { throw e?.code === "23505" ? new DuplicateCoupon() : e; }
  }
  async remove(id: string) { const r = await this.q("DELETE FROM coupons WHERE id = $1", [id]); return (r.rowCount ?? 0) > 0; }
}
