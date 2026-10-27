/**
 * Runs the real PostgreSQL stores against a real database. Skipped unless DATABASE_URL_TEST is set (CI provides a Postgres service).
 * Locally:  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=ci postgres:16  &&  DATABASE_URL_TEST=postgres://postgres:ci@localhost:5432/postgres npm test
 * Every run uses its own throw-away schema, so it never touches real data.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DuplicateError, InUseError } from "../src/catalogStore.js";
import { OpenOrdersLimitError, OrderIssuesError, TransitionError } from "../src/orderStore.js";
import { PgBanners } from "../src/pgBanners.js";
import { PgCatalog } from "../src/pgCatalog.js";
import { PgCoupons } from "../src/pgCoupons.js";
import { PgEmailStore } from "../src/pgEmail.js";
import { PgOrders } from "../src/pgOrders.js";
import { PgPushStore } from "../src/pgPush.js";
import { PgStore } from "../src/pgStore.js";
import { PgSettings } from "../src/settingsStore.js";

const url = process.env.DATABASE_URL_TEST;
const PRICE = { SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, MAX_COD_ORDER_PKR: 200000 };
const customer = { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" };
const address = { line1: "House 1, Street 2", line2: null, city: "Lahore", province: null, postalCode: null };

describe.skipIf(!url)("PostgreSQL integration (real SQL)", () => {
  const schema = `itest_${randomBytes(4).toString("hex")}`;
  let store: PgStore, catalog: PgCatalog, orders: PgOrders, emails: PgEmailStore, push: PgPushStore, settings: PgSettings, coupons: PgCoupons, banners: PgBanners;
  let adminId: string, categoryId: string; let n = 0;

  beforeAll(async () => {
    const root = new pg.Client({ connectionString: url }); await root.connect();
    await root.query(`CREATE SCHEMA ${schema}`); await root.query(`SET search_path TO ${schema}, public`);
    const dir = join(import.meta.dirname, "..", "db", "migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await root.query(readFileSync(join(dir, f), "utf8"));      // every migration must apply cleanly, in order
    await root.end();
    store = new PgStore(url!, { options: `-c search_path=${schema},public` }); const db = store.db;
    catalog = new PgCatalog(db); orders = new PgOrders(db); emails = new PgEmailStore(db); push = new PgPushStore(db); settings = new PgSettings(db); coupons = new PgCoupons(db); banners = new PgBanners(db);
    adminId = (await store.createUser({ email: "admin@t.test", passwordHash: null, googleSub: null, fullName: "Admin", phone: null, role: "admin" })).id;
    categoryId = (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true })).id;
  });
  afterAll(async () => { await store?.close(); const root = new pg.Client({ connectionString: url }); await root.connect(); await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.end(); });

  const user = async (tag: string) => (await store.createUser({ email: `${tag}${++n}@t.test`, passwordHash: null, googleSub: null, fullName: `User ${tag}`, phone: null, role: "customer" })).id;
  async function product(price = 1000, stock = 10, salePrice: number | null = null) {
    const sku = `PG-${++n}`;
    const p = await catalog.createProduct({ sku, name: `Item ${sku}`, description: "d", categoryId, price, salePrice, fabric: "Lawn", isPublished: false, isFeatured: false, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock }] });
    await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 }); await catalog.setPublished(p.id, true);
    return { id: p.id, sku, variant: p.variants[0]!.id };
  }
  const place = (userId: string, variant: string, o: { qty?: number; key?: string; coupon?: string; maxOpen?: number } = {}) => orders.createOrder({ userId, idempotencyKey: o.key ?? `k-${++n}-${randomBytes(3).toString("hex")}`,
    items: [{ variantId: variant, qty: o.qty ?? 1 }], customer, address, notes: null, cfg: PRICE, couponCode: o.coupon ?? null, maxOpenOrders: o.maxOpen });
  const stock = async (variant: string) => (await catalog.getVariantsByIds([variant]))[0]!.stock;

  it("accounts: citext emails, uniqueness, anonymisation", async () => {
    const id = await user("acct"); const u = (await store.findUserById(id))!;
    expect((await store.findUserByEmail(u.email.toUpperCase()))?.id).toBe(id);
    await expect(store.createUser({ email: u.email.toUpperCase(), passwordHash: null, googleSub: null, fullName: "Dup", phone: null, role: "customer" })).rejects.toMatchObject({ code: "23505" });
    await store.createAddress(id, { label: null, recipient: "A", phone: "+92 300 1234567", line1: "L1 street", line2: null, city: "Lahore", province: null, postalCode: null, isDefault: true });
    await push.upsertDevice(id, "tok-".padEnd(30, "z"), "android"); await store.anonymiseUser(id);
    const gone = (await store.findUserById(id))!; expect(gone.deletedAt).toBeTruthy(); expect(gone.email).toMatch(/@deleted\.invalid$/); expect(await store.listAddresses(id)).toEqual([]); expect(await push.tokensForUser(id)).toEqual([]);
  });

  it("catalogue: filters, sorting, ids, duplicate SKUs and category protection", async () => {
    const a = await product(1000, 5, 800), b = await product(3000, 0);
    const byPrice = await catalog.listProducts({ publishedOnly: true, sort: "price_asc", page: 1, limit: 50, ids: [a.id, b.id] }); expect(byPrice.items.map((p) => p.id)).toEqual([a.id, b.id]);
    expect((await catalog.listProducts({ publishedOnly: true, sort: "new", page: 1, limit: 50, ids: [a.id, b.id], inStock: true })).items.map((p) => p.id)).toEqual([a.id]);
    expect((await catalog.listProducts({ publishedOnly: true, sort: "new", page: 1, limit: 50, ids: [a.id, b.id], onSale: true })).total).toBe(1);
    expect((await catalog.listProducts({ publishedOnly: true, sort: "new", page: 1, limit: 50, q: a.sku.toLowerCase(), minPrice: 700, maxPrice: 900 })).items[0]?.id).toBe(a.id);   // price filter uses the sale price
    await expect(catalog.createProduct({ sku: a.sku, name: "Dup", description: "", categoryId, price: 5, salePrice: null, fabric: null, isPublished: false, isFeatured: false, variants: [] })).rejects.toBeInstanceOf(DuplicateError);
    await expect(catalog.createProduct({ sku: `PG-new-${++n}`, name: "Steals variant sku", description: "", categoryId, price: 5, salePrice: null, fabric: null, isPublished: false, isFeatured: false,
      variants: [{ sku: `${a.sku}-M`, size: "M", color: "Black", stock: 1 }] })).rejects.toBeInstanceOf(DuplicateError);
    await expect(catalog.deleteCategory(categoryId)).rejects.toBeInstanceOf(InUseError);
    expect((await catalog.stats()).products).toBeGreaterThanOrEqual(2);
  });

  it("orders: totals, stock reservation, idempotent replay, cancel restores stock", async () => {
    const p = await product(5000, 5, 4000), u = await user("buyer");
    const { order, created } = await place(u, p.variant, { qty: 2, key: "replay-key-12345" });
    expect(created).toBe(true); expect(order).toMatchObject({ subtotal: 8000, shipping: 299, total: 8299, status: "pending", paymentStatus: "unpaid" }); expect(order.orderNumber).toMatch(/^TS-\d+$/); expect(await stock(p.variant)).toBe(3);
    const again = await place(u, p.variant, { qty: 2, key: "replay-key-12345" }); expect(again.created).toBe(false); expect(again.order.id).toBe(order.id); expect(await stock(p.variant)).toBe(3);
    const c = await orders.customerCancel(u, order.id); expect(c?.status).toBe("cancelled"); expect(await stock(p.variant)).toBe(5);
    expect(await orders.getForUser(await user("other"), order.id)).toBeNull();                                  // another customer cannot read it
  });

  it("orders: two buyers racing for the last item, exactly one wins (row locks)", async () => {
    const p = await product(1000, 1); const [u1, u2] = [await user("r1"), await user("r2")];
    const r = await Promise.allSettled([place(u1, p.variant), place(u2, p.variant)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1); const lost = r.find((x) => x.status === "rejected") as PromiseRejectedResult; expect(lost.reason).toBeInstanceOf(OrderIssuesError); expect(await stock(p.variant)).toBe(0);
  });

  it("orders: single-use coupon cannot be used twice at once; cancelling returns the use; open-order cap", async () => {
    const p = await product(1000, 20); await coupons.create({ code: `ONE${++n}`, type: "percent", value: 10, minSubtotal: 0, maxUses: 1, startsAt: null, endsAt: null, isActive: true });
    const code = (await coupons.list(1, 100)).items.find((c) => c.code.startsWith("ONE"))!.code; const [u1, u2] = [await user("c1"), await user("c2")];
    const r = await Promise.allSettled([place(u1, p.variant, { coupon: code }), place(u2, p.variant, { coupon: code })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1); expect((await coupons.getByCode(code))!.usedCount).toBe(1);
    const won = (r.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<any>).value.order; expect(won).toMatchObject({ discount: 100, total: 1199, couponCode: code });
    await orders.customerCancel(won.userId, won.id); expect((await coupons.getByCode(code))!.usedCount).toBe(0);
    const u3 = await user("cap"); await place(u3, p.variant, { maxOpen: 2 }); await place(u3, p.variant, { maxOpen: 2 });
    await expect(place(u3, p.variant, { maxOpen: 2 })).rejects.toBeInstanceOf(OpenOrdersLimitError);
  });

  it("orders: status machine, COD payment, returns window, listing, export, analytics and customers queries", async () => {
    const p = await product(2000, 10), u = await user("flow"); const { order } = await place(u, p.variant, { qty: 3 });
    await expect(orders.adminSetStatus(order.id, "delivered", null, null, adminId)).rejects.toBeInstanceOf(TransitionError);
    for (const s of ["confirmed", "processing"] as const) await orders.adminSetStatus(order.id, s, null, null, adminId);
    await orders.adminSetStatus(order.id, "shipped", "Courier", "https://track.example.com/1", adminId);
    const done = (await orders.adminSetStatus(order.id, "delivered", null, null, adminId))!; expect(done.paymentStatus).toBe("paid"); expect(done.trackingUrl).toBe("https://track.example.com/1");
    expect(done.history.map((h) => h.status)).toEqual(["pending", "confirmed", "processing", "shipped", "delivered"]);
    expect((await orders.requestReturn(u, order.id, "Wrong size ordered", 7))?.status).toBe("refund_requested");
    expect((await orders.adminSetStatus(order.id, "refunded", null, null, adminId))!.paymentStatus).toBe("refunded");
    const list = await orders.adminList({ status: "refunded", q: order.orderNumber.toLowerCase(), page: 1, limit: 10 }); expect(list.items.map((o) => o.id)).toContain(order.id);
    expect((await orders.adminList({ from: "2000-01-01", to: "2999-12-31", page: 1, limit: 5 })).total).toBeGreaterThan(0);
    expect((await orders.exportForUser(u)).length).toBe(1); expect((await orders.adminExport({ status: "refunded" })).length).toBeGreaterThanOrEqual(1);
    const a = await orders.analytics(7, "Asia/Karachi"); expect(a.series).toHaveLength(7); expect(a.sales).toBeGreaterThan(0); expect(Array.isArray(a.topProducts)).toBe(true);
    expect((await orders.adminCustomers(undefined, 1, 10)).total).toBeGreaterThan(0); expect((await orders.adminCustomers("flow", 1, 10)).items.length).toBeGreaterThan(0);
    expect((await orders.listForUser(u, 1, 10)).total).toBe(1);
  });

  it("email outbox: dedupe, concurrent workers never claim the same row, retry, provider state, abuse counter", async () => {
    const orderId = (await place(await user("mail"), (await product()).variant)).order.id;
    expect(await emails.enqueue({ orderId, kind: "order_confirmation", toEmail: "x@example.com", dedupeKey: `d:${orderId}` })).toBe(true);
    expect(await emails.enqueue({ orderId, kind: "order_confirmation", toEmail: "x@example.com", dedupeKey: `d:${orderId}` })).toBe(false);
    for (let i = 0; i < 6; i++) await emails.enqueue({ orderId, kind: "status_update", toEmail: "y@example.com", dedupeKey: `s${i}:${orderId}` });
    const [a, b] = await Promise.all([emails.claimDue(4), emails.claimDue(4)]); const ids = [...a, ...b].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); expect(ids.length).toBe(7); expect([...a, ...b].every((r) => r.attempts === 1)).toBe(true);
    await emails.markSent(a[0]!.id, "msg-1", "Subj"); expect(await emails.setProviderState("msg-1", "delivered")).toBe(true); await emails.setProviderState("msg-1", "delayed");
    expect((await emails.get(a[0]!.id))!.providerState).toBe("delivered");                                     // never downgraded
    await emails.markFailed(a[1]!.id, "boom"); expect(await emails.retry(a[1]!.id)).toBe(true); expect((await emails.get(a[1]!.id))).toMatchObject({ status: "queued", attempts: 0 });
    expect(await emails.countRecentTo("Y@example.com", 3600_000)).toBe(6); expect((await emails.list({ status: "sent", page: 1, limit: 10 })).total).toBe(1); expect((await emails.counts()).queued).toBeGreaterThan(0);
  });

  it("push store: token reassignment and cap, promo audience, inbox ownership", async () => {
    const [a, b] = [await user("pa"), await user("pb")];
    await push.upsertDevice(a, "tok-shared".padEnd(30, "x"), "android"); await push.upsertDevice(b, "tok-shared".padEnd(30, "x"), "android");
    expect(await push.tokensForUser(a)).toEqual([]); expect((await push.tokensForUser(b)).length).toBe(1);
    for (let i = 0; i < 7; i++) await push.upsertDevice(a, `tok-${i}-`.padEnd(30, "q"), "android"); expect((await push.tokensForUser(a)).length).toBe(5);
    await push.setPrefs(b, { promotions: false }); const aud = await push.promoAudience(); expect(aud.users).toBeGreaterThan(0);
    expect((await push.promoTokens()).includes("tok-shared".padEnd(30, "x"))).toBe(false);                        // opted out
    expect(await push.addPromoInbox({ title: "Sale", body: "Big sale", deepLink: null })).toBeGreaterThan(0);
    const inbox = await push.listNotifications(a, 1, 10); expect(inbox.unread).toBe(1); expect(await push.markRead(b, inbox.items[0]!.id)).toBe(false); expect(await push.markRead(a, inbox.items[0]!.id)).toBe(true); expect(await push.unreadCount(a)).toBe(0);
    const camp = await push.createCampaign({ title: "T", body: "B", deepLink: null, createdBy: adminId }); await push.finishCampaign(camp.id, { recipients: 3, failed: 1 });
    expect(await push.hasRecentCampaign("T", "B", 60_000)).toBe(true); expect((await push.listCampaigns(1, 5)).items[0]).toMatchObject({ recipients: 3, failed: 1 });
  });

  it("settings, banners, coupons and the admin activity log", async () => {
    const def = await settings.load(); expect(def.pages.privacy.length).toBeGreaterThan(50); await settings.save({ ...def, ownerEmail: "boss@t.test", shipping: { flat: 350, freeOver: 9000 } });
    expect(await settings.load()).toMatchObject({ ownerEmail: "boss@t.test", shipping: { flat: 350, freeOver: 9000 } });
    const live = await banners.create({ title: "Live", subtitle: null, ctaLabel: null, ctaLink: null, sortOrder: 1, isActive: true, startsAt: null, endsAt: null });
    await banners.create({ title: "Old", subtitle: null, ctaLabel: null, ctaLink: null, sortOrder: 0, isActive: true, startsAt: null, endsAt: new Date("2020-01-01") });
    expect((await banners.live(new Date())).map((b) => b.title)).toEqual(["Live"]); expect((await banners.setImage(live.id, "banners/x.webp")).ok).toBe(true);
    await expect(coupons.create({ code: "EID10", type: "percent", value: 10, minSubtotal: 0, maxUses: null, startsAt: null, endsAt: null, isActive: true })).resolves.toBeTruthy();
    await expect(coupons.create({ code: "eid10", type: "percent", value: 10, minSubtotal: 0, maxUses: null, startsAt: null, endsAt: null, isActive: true })).rejects.toBeTruthy();   // citext uniqueness
    await store.logActivity({ adminId, action: "coupon.create", entity: "coupon", entityId: "x", meta: { code: "EID10" }, ip: "1.2.3.4" });
    const log = await store.listActivity(1, 10, "coupon"); expect(log.items[0]).toMatchObject({ action: "coupon.create", adminEmail: "admin@t.test" }); expect((await store.listActivity(1, 10, "nothing")).total).toBe(0);
  });
});
