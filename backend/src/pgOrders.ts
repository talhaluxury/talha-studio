import pg from "pg";
import { canTransition, CUSTOMER_CANCELLABLE, restoresStock, type OrderStatus } from "./orderStatus.js";
import {
  OpenOrdersLimitError, OPEN_STATUSES, OrderIssuesError, TransitionError,
  type Analytics, type CustomerRow, type NewOrderInput, type OrderFilter, type OrderRec, type OrderStore, type OrderSummary,
} from "./orderStore.js";
import { priceCart } from "./pricing.js";
import type { VariantLookup } from "./catalogStore.js";
import { toCoupon } from "./pgCoupons.js";

type Row = Record<string, any>;
const THUMB = `(SELECT i.thumb_key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1)`;
const toSummary = (r: Row): OrderSummary => ({
  id: r.id, orderNumber: r.order_number, status: r.status, total: r.total, createdAt: r.created_at, itemCount: r.item_count,
  firstItemName: r.first_name, firstThumbKey: r.first_thumb, customerName: r.customer_name, customerPhone: r.customer_phone,
});
const SUMMARY_SQL = `SELECT o.id, o.order_number, o.status, o.total, o.created_at, o.customer_name, o.customer_phone,
  COALESCE((SELECT sum(qty) FROM order_items WHERE order_id = o.id), 0)::int AS item_count,
  (SELECT name FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_name,
  (SELECT thumb_key FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS first_thumb
  FROM orders o`;

export class PgOrders implements OrderStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
    catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }

  private async load(where: string, v: unknown[], c: { query: pg.Pool["query"] } = this.pool): Promise<OrderRec | null> {
    const r = await (c as pg.Pool).query(`SELECT * FROM orders WHERE ${where}`, v as any[]); const o = r.rows[0]; if (!o) return null;
    const [items, hist] = await Promise.all([
      (c as pg.Pool).query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [o.id]),
      (c as pg.Pool).query("SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id", [o.id]),
    ]);
    return {
      id: o.id, orderNumber: o.order_number, userId: o.user_id, status: o.status, paymentMethod: o.payment_method, paymentStatus: o.payment_status,
      subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, couponCode: o.coupon_code,
      customer: { name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
      address: { line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, province: o.ship_province, postalCode: o.ship_postal },
      notes: o.notes, trackingUrl: o.tracking_url,
      items: items.rows.map((i) => ({ productId: i.product_id, variantId: i.variant_id, name: i.name, sku: i.sku, size: i.size, color: i.color, unitPrice: i.unit_price, qty: i.qty, thumbKey: i.thumb_key })),
      history: hist.rows.map((h) => ({ status: h.status, note: h.note, at: h.created_at })), createdAt: o.created_at, updatedAt: o.updated_at,
    };
  }

  async createOrder(i: NewOrderInput) {
    const key = `${i.userId}:${i.idempotencyKey}`;
    const prior = await this.load("idempotency_key = $1", [key]); if (prior) return { order: prior, created: false };
    try {
      const id = await this.tx(async (c) => {
        if (i.maxOpenOrders) {
          await c.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [i.userId]);          // serialise per customer so the cap cannot be raced
          const open = await c.query("SELECT count(*)::int AS n FROM orders WHERE user_id = $1 AND status = ANY($2::order_status[])", [i.userId, [...OPEN_STATUSES]]);
          if (open.rows[0].n >= i.maxOpenOrders) throw new OpenOrdersLimitError();
        }
        const ids = [...new Set(i.items.map((x) => x.variantId))].sort();
        // Lock the variant rows so two buyers cannot both take the last item.
        const r = await c.query(
          `SELECT v.id, v.sku, v.size, v.color, v.stock, p.id AS pid, p.name, p.price, p.sale_price, p.is_published, ${THUMB} AS thumb_key
           FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v`, [ids]);
        const found = new Map<string, VariantLookup>(r.rows.map((x) => [x.id, { variantId: x.id, sku: x.sku, size: x.size, color: x.color, stock: x.stock,
          product: { id: x.pid, name: x.name, price: x.price, salePrice: x.sale_price, isPublished: x.is_published, thumbKey: x.thumb_key } }]));
        // Lock the coupon row so a limited-use code cannot be used twice at once.
        const cr = i.couponCode ? await c.query("SELECT * FROM coupons WHERE code = $1 FOR UPDATE", [i.couponCode]) : null;
        const coupon = cr?.rows[0] ? toCoupon(cr.rows[0]) : null;
        const priced = priceCart(i.items, found, i.cfg, { requested: i.couponCode ?? null, rec: coupon, now: new Date() });
        if (priced.issues.length) throw new OrderIssuesError(priced.issues);
        if (priced.couponCode && coupon) {
          const cu = await c.query("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses)", [coupon.id]);
          if (cu.rowCount !== 1) throw new OrderIssuesError([{ variantId: "coupon", code: "COUPON_INVALID", message: "This code has been fully used" }]);
        }
        for (const l of priced.lines) {
          const u = await c.query("UPDATE product_variants SET stock = stock - $2 WHERE id = $1 AND stock >= $2", [l.variantId, l.qty]);
          if (u.rowCount !== 1) throw new OrderIssuesError([{ variantId: l.variantId, code: "INSUFFICIENT_STOCK", message: "Stock just changed" }]);
        }
        const num = (await c.query("SELECT nextval('order_number_seq') AS n")).rows[0].n;
        const o = await c.query(
          `INSERT INTO orders (order_number, user_id, idempotency_key, subtotal, discount, shipping, total, coupon_code, customer_name, customer_email, customer_phone,
             ship_line1, ship_line2, ship_city, ship_province, ship_postal, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
          [`TS-${num}`, i.userId, key, priced.subtotal, priced.discount, priced.shipping, priced.total, priced.couponCode, i.customer.name, i.customer.email, i.customer.phone,
           i.address.line1, i.address.line2, i.address.city, i.address.province, i.address.postalCode, i.notes]);
        const oid = o.rows[0].id as string;
        for (const l of priced.lines) await c.query(
          `INSERT INTO order_items (order_id, product_id, variant_id, name, sku, size, color, unit_price, qty, thumb_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [oid, l.productId, l.variantId, l.name, l.sku, l.size, l.color, l.unitPrice, l.qty, l.thumbKey]);
        await c.query("INSERT INTO order_status_history (order_id, status) VALUES ($1, 'pending')", [oid]);
        return oid;
      });
      return { order: (await this.load("id = $1", [id]))!, created: true };
    } catch (e: any) {
      if (e?.code === "23505" && String(e.constraint).includes("idempotency")) { const o = await this.load("idempotency_key = $1", [key]); if (o) return { order: o, created: false }; }
      throw e;
    }
  }

  /** Locks the order, validates the transition, restores stock on cancel, updates payment state and history. */
  private async applyStatus(c: pg.PoolClient, orderId: string, to: OrderStatus, note: string | null, tracking: string | null, byUser: string | null, only?: { userId: string; allowed: OrderStatus[] }) {
    const r = await c.query("SELECT id, status, payment_status, user_id FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
    const o = r.rows[0]; if (!o || (only && o.user_id !== only.userId)) return false;
    if (only && !only.allowed.includes(o.status)) throw new TransitionError("This order can no longer be cancelled online. Please contact support.");
    if (!canTransition(o.status, to)) throw new TransitionError(`Cannot change an order from ${o.status} to ${to}`);
    if (restoresStock(to)) {
      await c.query(`UPDATE product_variants v SET stock = v.stock + i.qty FROM order_items i WHERE i.order_id = $1 AND i.variant_id = v.id`, [orderId]);
      await c.query("UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE code = (SELECT coupon_code FROM orders WHERE id = $1)", [orderId]);   // cancelled orders return their coupon use
    }
    const pay = to === "delivered" ? "paid" : to === "refunded" && o.payment_status === "paid" ? "refunded" : o.payment_status;
    await c.query("UPDATE orders SET status = $2, payment_status = $3, tracking_url = COALESCE($4, tracking_url), updated_at = now() WHERE id = $1", [orderId, to, pay, tracking]);
    await c.query("INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1,$2,$3,$4)", [orderId, to, note, byUser]);
    return true;
  }

  async listForUser(userId: string, page: number, limit: number) {
    const [rows, n] = await Promise.all([
      this.q(`${SUMMARY_SQL} WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, [userId]),
      this.q("SELECT count(*)::int AS n FROM orders WHERE user_id = $1", [userId]),
    ]);
    return { items: rows.rows.map(toSummary), total: n.rows[0].n };
  }
  getForUser(userId: string, id: string) { return this.load("id = $1 AND user_id = $2", [id, userId]); }

  async customerCancel(userId: string, id: string) {
    const ok = await this.tx((c) => this.applyStatus(c, id, "cancelled", "Cancelled by customer", null, null, { userId, allowed: CUSTOMER_CANCELLABLE }));
    return ok ? this.getForUser(userId, id) : null;
  }
  async requestReturn(userId: string, id: string, reason: string, windowDays: number) {
    const ok = await this.tx(async (c) => {
      const r = await c.query("SELECT status, user_id FROM orders WHERE id = $1 FOR UPDATE", [id]);
      const o = r.rows[0]; if (!o || o.user_id !== userId) return false;
      if (o.status !== "delivered") throw new TransitionError("Only delivered orders can be returned.");
      const d = await c.query("SELECT max(created_at) AS at FROM order_status_history WHERE order_id = $1 AND status = 'delivered'", [id]);
      if (!d.rows[0].at || Date.now() - new Date(d.rows[0].at).getTime() > windowDays * 86400_000) throw new TransitionError(`The ${windowDays}-day return window has passed.`);
      await c.query("INSERT INTO return_requests (order_id, reason) VALUES ($1,$2)", [id, reason]);
      return this.applyStatus(c, id, "refund_requested", reason, null, null);
    });
    return ok ? this.getForUser(userId, id) : null;
  }

  private where(f: Omit<OrderFilter, "page" | "limit">) {
    const w: string[] = []; const v: unknown[] = []; const add = (s: string, x: unknown) => { v.push(x); w.push(s.replaceAll("?", `$${v.length}`)); };
    if (f.status) add("o.status = ?", f.status);
    if (f.q) add("(o.order_number ILIKE ? OR o.customer_name ILIKE ? OR o.customer_email ILIKE ? OR o.customer_phone ILIKE ?)", `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
    if (f.from) add("o.created_at >= ?::date", f.from);
    if (f.to) add("o.created_at < (?::date + 1)", f.to);
    return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", v };
  }
  async adminList(f: OrderFilter) {
    const { sql, v } = this.where(f);
    const [rows, n] = await Promise.all([
      this.q(`${SUMMARY_SQL} ${sql} ORDER BY o.created_at DESC LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`, v),
      this.q(`SELECT count(*)::int AS n FROM orders o ${sql}`, v),
    ]);
    return { items: rows.rows.map(toSummary), total: n.rows[0].n };
  }
  adminGet(id: string) { return this.load("id = $1", [id]); }
  async adminSetStatus(id: string, to: OrderStatus, note: string | null, trackingUrl: string | null, adminId: string) {
    const ok = await this.tx((c) => this.applyStatus(c, id, to, note, trackingUrl, adminId));
    return ok ? this.adminGet(id) : null;
  }
  async adminExport(f: Omit<OrderFilter, "page" | "limit">) {
    const { sql, v } = this.where(f);
    const ids = await this.q(`SELECT o.id FROM orders o ${sql} ORDER BY o.created_at DESC LIMIT 5000`, v);
    const out: OrderRec[] = []; for (const r of ids.rows) { const o = await this.adminGet(r.id); if (o) out.push(o); } return out;
  }
  async adminCustomers(q: string | undefined, page: number, limit: number) {
    const v: unknown[] = []; let w = "WHERE u.role = 'customer' AND u.deleted_at IS NULL";
    if (q) { v.push(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`); w += ` AND (u.email ILIKE $1 OR u.full_name ILIKE $1)`; }
    const [rows, n] = await Promise.all([
      this.q(`SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
                count(o.id) FILTER (WHERE o.status NOT IN ('cancelled','refunded'))::int AS orders,
                COALESCE(sum(o.total) FILTER (WHERE o.status NOT IN ('cancelled','refunded')), 0)::int AS spent
              FROM users u LEFT JOIN orders o ON o.user_id = u.id ${w} GROUP BY u.id ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, v),
      this.q(`SELECT count(*)::int AS n FROM users u ${w}`, v),
    ]);
    return { items: rows.rows.map((r): CustomerRow => ({ id: r.id, fullName: r.full_name, email: r.email, phone: r.phone, createdAt: r.created_at, orders: r.orders, spent: r.spent })), total: n.rows[0].n };
  }
  async analytics(days: number, tz: string): Promise<Analytics> {
    const [series, totals, status, top] = await Promise.all([
      this.q(`SELECT d::date::text AS date, count(o.id)::int AS orders,
                COALESCE(sum(o.total) FILTER (WHERE o.status NOT IN ('cancelled','refunded')), 0)::int AS sales
              FROM generate_series(((now() AT TIME ZONE $2::text)::date - ($1::int - 1))::timestamp, (now() AT TIME ZONE $2::text)::date::timestamp, interval '1 day') d
              LEFT JOIN orders o ON (o.created_at AT TIME ZONE $2::text)::date = d::date GROUP BY d ORDER BY d`, [days, tz]),
      this.q("SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending FROM orders"),
      this.q("SELECT status, count(*)::int AS n FROM orders GROUP BY status"),
      this.q(`SELECT i.name, sum(i.qty)::int AS qty, sum(i.qty * i.unit_price)::int AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
              WHERE (o.created_at AT TIME ZONE $2::text)::date >= (now() AT TIME ZONE $2::text)::date - ($1::int - 1) AND o.status NOT IN ('cancelled','refunded')
              GROUP BY i.name ORDER BY qty DESC, revenue DESC LIMIT 5`, [days, tz]),
    ]);
    const byStatus: Record<string, number> = {}; for (const r of status.rows) byStatus[r.status] = r.n;
    return { sales: series.rows.reduce((a, r) => a + r.sales, 0), orders: series.rows.reduce((a, r) => a + r.orders, 0),
      pending: totals.rows[0].pending, customers: 0, series: series.rows, byStatus, topProducts: top.rows };
  }
  async exportForUser(userId: string) {
    const ids = await this.q("SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000", [userId]);
    const out: OrderRec[] = []; for (const r of ids.rows) { const o = await this.adminGet(r.id); if (o) out.push(o); } return out;
  }
}
