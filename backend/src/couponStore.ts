export interface CouponRec {
  id: string; code: string; type: "percent" | "fixed"; value: number; minSubtotal: number; maxUses: number | null; usedCount: number;
  startsAt: Date | null; endsAt: Date | null; isActive: boolean; createdAt: Date;
}
export interface CouponInput { code: string; type: "percent" | "fixed"; value: number; minSubtotal: number; maxUses: number | null; startsAt: Date | null; endsAt: Date | null; isActive: boolean }
export class DuplicateCoupon extends Error {}

export interface CouponStore {
  list(page: number, limit: number): Promise<{ items: CouponRec[]; total: number }>;
  get(id: string): Promise<CouponRec | null>;
  getByCode(code: string): Promise<CouponRec | null>;
  create(c: CouponInput): Promise<CouponRec>;            // throws DuplicateCoupon
  update(id: string, c: CouponInput): Promise<CouponRec | null>;
  remove(id: string): Promise<boolean>;
}

/** Returns an error message when the coupon cannot be used for this subtotal, else null. Pure: shared by quotes and checkout. */
export function couponProblem(c: CouponRec | null, subtotal: number, now: Date): string | null {
  if (!c || !c.isActive) return "This code is not valid";
  if (c.startsAt && now < c.startsAt) return "This code is not active yet";
  if (c.endsAt && now > c.endsAt) return "This code has expired";
  if (c.maxUses != null && c.usedCount >= c.maxUses) return "This code has been fully used";
  if (subtotal < c.minSubtotal) return `Spend Rs. ${c.minSubtotal.toLocaleString("en-PK")} or more to use this code`;
  return null;
}
export const couponDiscount = (c: CouponRec, subtotal: number) => Math.min(subtotal, c.type === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value);
