import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryCoupons } from "../src/memoryCoupons.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { renderPageBody } from "../src/routes/info.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";
import { emailCfgFields, emailDeps } from "./helpers.js";

const cfg = {
  NODE_ENV: "test", ...emailCfgFields, FCM_SERVICE_ACCOUNT_JSON: "", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async (b) => ({ full: Buffer.from("full:" + b.length), thumb: Buffer.from("t"), width: 1, height: 1 }) };

let app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStore, catalog: MemoryCatalog, coupons: MemoryCoupons, storage: MemoryStorage, deps: ReturnType<typeof emailDeps>;
let owner: string, admin: string, staff: string, alice: string, bob: string;
const mk = async (role: "owner" | "admin" | "staff") => {
  await store.createUser({ email: `${role}@t.test`, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: role, phone: null, role });
  return (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: `${role}@t.test`, password: "staff-password-1" } })).json().accessToken as string;
};
const reg = async (email: string) => (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Test User", email, password: "correct-horse-1" } })).json().accessToken as string;
beforeEach(async () => {
  store = new MemoryStore(); catalog = new MemoryCatalog(); coupons = new MemoryCoupons(); storage = new MemoryStorage();
  const orders = new MemoryOrders(catalog, store, coupons); deps = { ...emailDeps(orders, cfg), coupons };
  app = await buildApp(cfg, { store, catalog, orders, storage, images, ...deps });
  [owner, admin, staff] = [await mk("owner"), await mk("admin"), await mk("staff")]; alice = await reg("alice@t.test"); bob = await reg("bob@t.test");
});
const call = (method: any, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as any, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
let n = 0;
async function product(price: number, salePrice: number | null = null, stock = 50) {
  const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
  const sku = `Q${++n}`; const p = (await call("POST", "/v1/admin/products", admin, { sku, name: `Item ${sku}`, categoryId: cat.id, price, salePrice, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock }] })).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 });
  await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true }); return { id: p.id as string, variant: p.variants[0].id as string };
}
const mkCoupon = async (o: object = {}) => (await call("POST", "/v1/admin/coupons", admin, { code: "EID10", type: "percent", value: 10, ...o })).json();
const quote = (variant: string, qty: number, couponCode?: string) => call("POST", "/v1/cart/quote", undefined, { items: [{ variantId: variant, qty }], couponCode }).then((r) => r.json());
const order = (token: string, variant: string, qty = 1, couponCode?: string) => app.inject({ method: "POST", url: "/v1/orders", headers: { authorization: `Bearer ${token}`, "idempotency-key": `ck-${++n}-abcdefgh` },
  payload: { items: [{ variantId: variant, qty }], customer: { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" }, address: { line1: "House 1, Street 2", city: "Lahore" }, paymentMethod: "cod", couponCode } });

describe("coupons (admin)", () => {
  it("manages coupons with permissions, normalisation and validation", async () => {
    expect((await call("POST", "/v1/admin/coupons", staff, { code: "X1X", type: "percent", value: 5 })).statusCode).toBe(403);
    const c = await call("POST", "/v1/admin/coupons", admin, { code: " eid10 ", type: "percent", value: 10, minSubtotal: 2000 });
    expect(c.statusCode).toBe(201); expect(c.json()).toMatchObject({ code: "EID10", usedCount: 0, isActive: true });
    expect((await mkCoupon()).error.code).toBe("CONFLICT");
    expect((await call("POST", "/v1/admin/coupons", admin, { code: "BIG", type: "percent", value: 150 })).statusCode).toBe(400);
    expect((await call("POST", "/v1/admin/coupons", admin, { code: "a b", type: "fixed", value: 100 })).statusCode).toBe(400);
    expect((await call("POST", "/v1/admin/coupons", admin, { code: "DATES", type: "fixed", value: 100, startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" })).statusCode).toBe(400);
    const upd = await call("PUT", `/v1/admin/coupons/${c.json().id}`, admin, { code: "EID15", type: "percent", value: 15 }); expect(upd.json()).toMatchObject({ code: "EID15", value: 15 });
    expect((await call("GET", "/v1/admin/coupons", admin)).json().total).toBe(1);
    expect((await call("DELETE", `/v1/admin/coupons/${c.json().id}`, admin)).statusCode).toBe(204);
  });
});

describe("coupons at quote and checkout", () => {
  it("applies percent and fixed discounts on the server, capped at the subtotal", async () => {
    const p = await product(5000); await mkCoupon({ minSubtotal: 0 }); await mkCoupon({ code: "FLAT9K", type: "fixed", value: 9000 });
    const q = await quote(p.variant, 2, "eid10"); expect(q).toMatchObject({ subtotal: 10000, discount: 1000, shipping: 299, total: 9299, couponCode: "EID10", issues: [] });
    const f = await quote(p.variant, 1, "FLAT9K"); expect(f).toMatchObject({ subtotal: 5000, discount: 5000, total: 299 });
  });
  it("explains why a code cannot be used", async () => {
    const p = await product(1000);
    await mkCoupon({ code: "MIN5K", minSubtotal: 5000 }); await mkCoupon({ code: "OLD", endsAt: "2020-01-01T00:00:00Z" }); await mkCoupon({ code: "OFF", isActive: false }); await mkCoupon({ code: "SOON", startsAt: "2099-01-01T00:00:00Z" });
    const msgs = await Promise.all(["MIN5K", "OLD", "OFF", "SOON", "NOPE"].map(async (c) => (await quote(p.variant, 1, c)).issues[0]));
    expect(msgs.map((m) => m.code)).toEqual(Array(5).fill("COUPON_INVALID")); expect(msgs[0].message).toContain("5,000"); expect(msgs[1].message).toContain("expired"); expect(msgs[3].message).toContain("not active yet");
  });
  it("saves the discount on the order and counts the use; cancelling gives the use back", async () => {
    const p = await product(5000); await mkCoupon({ maxUses: 5 });
    const r = await order(alice, p.variant, 2, "EID10"); expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ subtotal: 10000, discount: 1000, total: 9299, couponCode: "EID10" }); expect(coupons.rows[0]!.usedCount).toBe(1);
    await call("POST", `/v1/me/orders/${r.json().id}/cancel`, alice); expect(coupons.rows[0]!.usedCount).toBe(0);
  });
  it("rejects an invalid code at checkout without taking stock", async () => {
    const p = await product(1000, null, 5); const r = await order(alice, p.variant, 1, "NOPE");
    expect(r.statusCode).toBe(409); expect(r.json().error.details.issues[0]).toMatchObject({ variantId: "coupon", code: "COUPON_INVALID" });
    expect((await catalog.getVariantsByIds([p.variant]))[0]!.stock).toBe(5);
  });
  it("a single-use code can be used by only one of two simultaneous buyers", async () => {
    const p = await product(1000); await mkCoupon({ maxUses: 1 });
    const [a, b] = await Promise.all([order(alice, p.variant, 1, "EID10"), order(bob, p.variant, 1, "EID10")]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]); expect(coupons.rows[0]!.usedCount).toBe(1);
  });
  it("judges free shipping on the amount after the discount", async () => {
    await call("PUT", "/v1/admin/store-settings", owner, { ...(await call("GET", "/v1/admin/store-settings", owner)).json(), shipping: { flat: 300, freeOver: 5000 } });
    const p = await product(5500); await mkCoupon();
    expect((await quote(p.variant, 1)).shipping).toBe(0); expect((await quote(p.variant, 1, "EID10")).shipping).toBe(300);       // 5500 -> 4950 after 10%
  });
});

describe("banners and announcement", () => {
  const body = (o: object = {}) => ({ title: "Winter Collection", subtitle: "Warm and elegant", ctaLabel: "Shop now", sortOrder: 1, isActive: true, ...o });
  it("manages banners (admin/owner only), validates links and shows only live ones in /home", async () => {
    expect((await call("POST", "/v1/admin/banners", staff, body())).statusCode).toBe(403);
    const b = (await call("POST", "/v1/admin/banners", admin, body())).json();
    expect((await call("POST", "/v1/admin/banners", admin, body({ ctaLink: "https://evil.example.com" }))).statusCode).toBe(400);
    const p = await product(1000); const link = `talhastudio://product/${p.id}`;
    expect((await call("PUT", `/v1/admin/banners/${b.id}`, admin, body({ ctaLink: link }))).json().ctaLink).toBe(link);
    await call("POST", "/v1/admin/banners", admin, body({ title: "Hidden", isActive: false })); await call("POST", "/v1/admin/banners", admin, body({ title: "Expired", endsAt: "2020-01-01T00:00:00Z" }));
    await call("POST", "/v1/admin/banners", admin, body({ title: "Future", startsAt: "2099-01-01T00:00:00Z" }));
    const home = (await call("GET", "/v1/home")).json(); expect(home.banners.map((x: any) => x.title)).toEqual(["Winter Collection"]);
    expect((await call("GET", "/v1/admin/banners", admin)).json().items).toHaveLength(4);
  });
  it("uploads and replaces the banner image, deleting the old file", async () => {
    const b = (await call("POST", "/v1/admin/banners", admin, body())).json();
    const up = (data: string) => { const bd = "----b"; return app.inject({ method: "POST", url: `/v1/admin/banners/${b.id}/image`, headers: { authorization: `Bearer ${admin}`, "content-type": `multipart/form-data; boundary=${bd}` },
      payload: Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${data}\r\n--${bd}--\r\n`) }); };
    const first = await up("one"); expect(first.statusCode).toBe(201); expect(storage.files.size).toBe(1);
    const second = await up("twotwo"); expect(second.statusCode).toBe(201); expect(storage.files.size).toBe(1);
    expect((await call("GET", "/v1/home")).json().banners[0].imageUrl).toBe(second.json().imageUrl);
    await call("DELETE", `/v1/admin/banners/${b.id}`, admin); expect(storage.files.size).toBe(0);
  });
  it("shows the announcement strip only while active", async () => {
    const cur = (await call("GET", "/v1/admin/store-settings", owner)).json();
    await call("PUT", "/v1/admin/store-settings", owner, { ...cur, announcement: { text: "Eid sale: free delivery", active: true } });
    expect((await call("GET", "/v1/home")).json().announcement).toBe("Eid sale: free delivery");
    await call("PUT", "/v1/admin/store-settings", owner, { ...cur, announcement: { text: "Eid sale: free delivery", active: false } });
    expect((await call("GET", "/v1/home")).json().announcement).toBeNull();
  });
});

describe("store settings, policy pages and privacy", () => {
  it("only the owner edits shipping and pages, with validation, and changes reach customers", async () => {
    expect((await call("GET", "/v1/admin/store-settings", admin)).statusCode).toBe(403);
    const cur = (await call("GET", "/v1/admin/store-settings", owner)).json(); expect(cur.shipping).toEqual({ flat: 299, freeOver: 0 });
    expect((await call("PUT", "/v1/admin/store-settings", owner, { ...cur, shipping: { flat: -1, freeOver: 0 } })).statusCode).toBe(400);
    expect((await call("PUT", "/v1/admin/store-settings", owner, { ...cur, announcement: { text: "a\nb", active: true } })).statusCode).toBe(400);
    const pages = { ...cur.pages, returns: "# Returns\n\nWe accept returns within 14 days." };
    expect((await call("PUT", "/v1/admin/store-settings", owner, { ...cur, shipping: { flat: 350, freeOver: 8000 }, pages })).statusCode).toBe(200);
    const p = await product(1000); expect((await quote(p.variant, 1)).shipping).toBe(350);
    expect((await call("GET", "/v1/pages/returns")).json().body).toContain("14 days"); expect((await call("GET", "/v1/store-info")).json().shipping).toEqual({ flat: 350, freeOver: 8000 });
  });
  it("serves every default page, and rejects unknown slugs", async () => {
    for (const s of ["privacy", "terms", "returns", "shipping", "refund", "about"]) { const r = await call("GET", `/v1/pages/${s}`); expect(r.statusCode).toBe(200); expect(r.json().body.length).toBeGreaterThan(80); }
    expect((await call("GET", "/v1/pages/secrets")).statusCode).toBe(404); expect((await call("GET", "/v1/store-info")).json().pages).toHaveLength(6);
    expect((await call("GET", "/v1/pages/privacy")).json().body).toContain("delete your account");
  });
  it("renders a public HTML privacy page with escaped content (usable as the Play Store URL)", async () => {
    const cur = (await call("GET", "/v1/admin/store-settings", owner)).json();
    await call("PUT", "/v1/admin/store-settings", owner, { ...cur, pages: { ...cur.pages, privacy: "# Data\n\n<script>alert(1)</script> & more" } });
    const r = await call("GET", "/legal/privacy"); expect(r.statusCode).toBe(200); expect(r.headers["content-type"]).toContain("text/html");
    expect(r.body).toContain("<h2>Data</h2>"); expect(r.body).not.toContain("<script>alert"); expect(r.body).toContain("&lt;script&gt;"); expect((await call("GET", "/legal/nope")).statusCode).toBe(404);
    expect(renderPageBody("# A\nline\n\npara")).toContain("<h2>A</h2><p>line</p>");
  });
  it("lets a customer download their own data, without secrets", async () => {
    const p = await product(1000); await order(alice, p.variant);
    await call("POST", "/v1/me/addresses", alice, { recipient: "Ali Khan", phone: "+92 300 1234567", line1: "House 1, Street 2", city: "Lahore" });
    const r = await call("GET", "/v1/me/export", alice); expect(r.statusCode).toBe(200); expect(r.headers["content-disposition"]).toContain("attachment");
    const d = r.json(); expect(d.profile.email).toBe("alice@t.test"); expect(d.orders).toHaveLength(1); expect(d.addresses).toHaveLength(1); expect(d.orders[0].items[0].qty).toBe(1);
    expect(r.body).not.toMatch(/passwordHash|argon2|refresh/i);
    expect((await call("GET", "/v1/me/export", bob)).json().orders).toHaveLength(0); expect((await call("GET", "/v1/me/export")).statusCode).toBe(401);
  });
});

describe("owner tools", () => {
  it("records admin actions in an owner-only activity log", async () => {
    await mkCoupon(); await call("POST", "/v1/admin/banners", admin, { title: "Hello there", sortOrder: 0, isActive: true });
    expect((await call("GET", "/v1/admin/activity-logs", admin)).statusCode).toBe(403);
    const r = (await call("GET", "/v1/admin/activity-logs", owner)).json(); const actions = r.items.map((i: any) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["coupon.create", "banner.create", "admin.login"])); expect(r.items.find((i: any) => i.action === "coupon.create").adminEmail).toBe("admin@t.test");
    expect((await call("GET", "/v1/admin/activity-logs?action=coupon", owner)).json().items.every((i: any) => i.action.startsWith("coupon"))).toBe(true);
  });
  it("includes top products in analytics", async () => {
    const a = await product(1000), b = await product(2000);
    await order(alice, a.variant, 3); await order(bob, b.variant, 1);
    const r = (await call("GET", "/v1/admin/analytics?days=7", staff)).json();
    expect(r.topProducts[0]).toMatchObject({ qty: 3, revenue: 3000 }); expect(r.topProducts).toHaveLength(2);
  });
});
