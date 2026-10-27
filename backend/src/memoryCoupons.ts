import { randomUUID } from "node:crypto";
import { DuplicateCoupon, type CouponInput, type CouponRec, type CouponStore } from "./couponStore.js";

export class MemoryCoupons implements CouponStore {
  rows: CouponRec[] = [];
  async list(page: number, limit: number) { return { items: this.rows.slice((page - 1) * limit, page * limit), total: this.rows.length }; }
  async get(id: string) { return this.rows.find((c) => c.id === id) ?? null; }
  async getByCode(code: string) { return this.rows.find((c) => c.code.toLowerCase() === code.toLowerCase()) ?? null; }
  async create(c: CouponInput) {
    if (await this.getByCode(c.code)) throw new DuplicateCoupon();
    const r: CouponRec = { id: randomUUID(), ...c, usedCount: 0, createdAt: new Date() }; this.rows.unshift(r); return r;
  }
  async update(id: string, c: CouponInput) {
    const r = await this.get(id); if (!r) return null;
    const dup = await this.getByCode(c.code); if (dup && dup.id !== id) throw new DuplicateCoupon();
    Object.assign(r, c); return r;
  }
  async remove(id: string) { const n = this.rows.length; this.rows = this.rows.filter((c) => c.id !== id); return this.rows.length < n; }
}
