import type { VariantLookup } from "./catalogStore.js";
import { couponDiscount, couponProblem, type CouponRec } from "./couponStore.js";

export interface PriceCfg { SHIPPING_FLAT_PKR: number; FREE_SHIPPING_OVER_PKR: number; MAX_COD_ORDER_PKR: number }
export interface PricedLine {
  variantId: string; productId: string; name: string; sku: string; size: string | null; color: string | null;
  unitPrice: number; qty: number; thumbKey: string | null;
}
export interface Issue { variantId: string; code: string; message: string; available?: number }
export interface Priced { lines: PricedLine[]; issues: Issue[]; subtotal: number; discount: number; shipping: number; total: number; couponCode: string | null }

export function shippingFor(subtotal: number, cfg: Pick<PriceCfg, "SHIPPING_FLAT_PKR" | "FREE_SHIPPING_OVER_PKR">) {
  if (subtotal <= 0) return 0;
  if (cfg.FREE_SHIPPING_OVER_PKR > 0 && subtotal >= cfg.FREE_SHIPPING_OVER_PKR) return 0;
  return cfg.SHIPPING_FLAT_PKR;
}

/**
 * The single source of truth for money. Used by /cart/quote AND order creation (inside the DB transaction),
 * so what the customer sees is exactly what is charged. Client-supplied prices never enter this function.
 */
export function priceCart(items: { variantId: string; qty: number }[], found: Map<string, VariantLookup>, cfg: PriceCfg, coupon?: { requested: string | null; rec: CouponRec | null; now: Date }): Priced {
  const wanted = new Map<string, number>();
  for (const it of items) wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.qty);   // merge duplicate lines
  const lines: PricedLine[] = []; const issues: Issue[] = []; let subtotal = 0;
  for (const [variantId, qty] of wanted) {
    const v = found.get(variantId);
    if (!v || !v.product.isPublished) { issues.push({ variantId, code: "UNAVAILABLE", message: "This item is no longer available" }); continue; }
    if (v.stock < qty) { issues.push({ variantId, code: v.stock === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK", message: v.stock === 0 ? "Out of stock" : `Only ${v.stock} left`, available: v.stock }); continue; }
    const unitPrice = v.product.salePrice ?? v.product.price;
    subtotal += unitPrice * qty;
    lines.push({ variantId, productId: v.product.id, name: v.product.name, sku: v.sku, size: v.size, color: v.color, unitPrice, qty, thumbKey: v.product.thumbKey });
  }
  // Coupon: validated against the cart value; free shipping is judged on the amount AFTER the discount.
  let discount = 0; let couponCode: string | null = null;
  if (coupon?.requested) {
    const problem = couponProblem(coupon.rec, subtotal, coupon.now);
    if (problem) issues.push({ variantId: "coupon", code: "COUPON_INVALID", message: problem });
    else { discount = couponDiscount(coupon.rec!, subtotal); couponCode = coupon.rec!.code; }
  }
  const shipping = subtotal <= 0 ? 0 : shippingFor(Math.max(subtotal - discount, 1), cfg); const total = subtotal - discount + shipping;   // a 100%-off cart still pays delivery
  if (total > cfg.MAX_COD_ORDER_PKR) issues.push({ variantId: "cart", code: "ORDER_TOO_LARGE", message: `Cash on Delivery orders are limited to Rs. ${cfg.MAX_COD_ORDER_PKR.toLocaleString("en-PK")}. Please split your order.` });
  return { lines, issues, subtotal, discount, shipping, total, couponCode };
}
