import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { OrderEvents } from "../src/events.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { emailDeps } from "./helpers.js";
import { csvCell } from "../src/routes/adminOrders.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };

let app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStore, catalog: MemoryCatalog, orders: MemoryOrders;
let admin: string, staff: string, alice: string, bob: string;
let placed: string[], changed: string[], failEvents: boolean;

async function mkStaff(role: "admin" | "staff") {
  await store.createUser({ email: `${role}@t.test`, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: role, phone: null, role });
  return (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: `${role}@t.test`, password: "staff-password-1" } })).json().accessToken as string;
}
const register = async (email: string) => (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Test User", email, password: "correct-horse-1" } })).json().accessToken as string;

beforeEach(async () => {
  store = new MemoryStore(); catalog = new MemoryCatalog(); orders = new MemoryOrders(catalog, store); placed = []; changed = []; failEvents = false;
  const events: OrderEvents = {
    orderPlaced: async (o) => { if (failEvents) throw new Error("smtp down"); placed.push(o.orderNumber); },
    statusChanged: async (o, prev) => { changed.push(`${prev}>${o.status}`); },
  };
  app = await buildApp(cfg, { store, catalog, orders, ...emailDeps(orders, cfg), storage: new MemoryStorage(), images, events });
  [admin, staff] = [await mkStaff("admin"), await mkStaff("staff")]; alice = await register("alice@t.test"); bob = await register("bob@t.test");
});

const call = (method: any, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

async function product(sku: string, price: number, salePrice: number | null, stock: number) {
  sku = `SKU-${sku}`;   // API requires 2+ char SKUs
  const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
  const p = (await call("POST", "/v1/admin/products", admin, { sku, name: `Item ${sku}`, categoryId: cat.id, price, salePrice, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock }] })).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 });
  await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
  return { id: p.id as string, variant: p.variants[0].id as string };
}
const body = (variant: string, qty = 1, extra: object = {}) => ({
  items: [{ variantId: variant, qty }], customer: { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" },
  address: { line1: "House 123, Street 1", city: "Lahore" }, paymentMethod: "cod", ...extra,
});
let n = 0; const place = (token: string | undefined, b: unknown, key = `key-${++n}-abcdefgh`) => call("POST", "/v1/orders", token, b, { "idempotency-key": key });
const stockOf = async (variant: string) => (await catalog.getVariantsByIds([variant]))[0]!.stock;

describe("placing an order", () => {
  it("prices on the server (ignoring client prices), decrements stock and returns an order number", async () => {
    const p = await product("A", 5000, 4000, 5);
    const r = await place(alice, { ...body(p.variant, 2), total: 1, subtotal: 1, items: [{ variantId: p.variant, qty: 2, unitPrice: 1 }] });
    expect(r.statusCode).toBe(201);
    const o = r.json();
    expect(o.orderNumber).toMatch(/^TS-\d{6}$/); expect(o.subtotal).toBe(8000); expect(o.shipping).toBe(299); expect(o.total).toBe(8299);
    expect(o.status).toBe("pending"); expect(o.paymentMethod).toBe("cod"); expect(o.items[0].unitPrice).toBe(4000);
    expect(await stockOf(p.variant)).toBe(3);
    expect(placed).toEqual([o.orderNumber]);
  });
  it("is idempotent: replaying the same key returns the same order once, with stock taken once", async () => {
    const p = await product("B", 1000, null, 5);
    const a = await place(alice, body(p.variant), "same-key-12345"); const b = await place(alice, body(p.variant), "same-key-12345");
    expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(200); expect(b.json().id).toBe(a.json().id);
    expect(await stockOf(p.variant)).toBe(4); expect(placed).toHaveLength(1);
  });
  it("never oversells the last item, even with simultaneous requests", async () => {
    const p = await product("C", 1000, null, 1);
    const [r1, r2] = await Promise.all([place(alice, body(p.variant)), place(bob, body(p.variant))]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([201, 409]);
    expect(await stockOf(p.variant)).toBe(0);
    const loser = [r1, r2].find((r) => r.statusCode === 409)!.json();
    expect(loser.error.code).toBe("CART_ISSUES"); expect(loser.error.details.issues[0].code).toBe("OUT_OF_STOCK");
  });
  it("rejects missing auth, missing idempotency key, and invalid input", async () => {
    const p = await product("D", 1000, null, 5);
    expect((await place(undefined, body(p.variant))).statusCode).toBe(401);
    expect((await call("POST", "/v1/orders", alice, body(p.variant))).statusCode).toBe(400);
    expect((await place(alice, body(p.variant, 1, { customer: { name: "Ali", email: "a@b.co", phone: "abc" } }))).statusCode).toBe(400);
    expect((await place(alice, body(p.variant, 0))).statusCode).toBe(400);
    expect((await place(alice, body(p.variant, 1, { paymentMethod: "card" }))).statusCode).toBe(400);
    expect(await stockOf(p.variant)).toBe(5);
  });
  it("blocks oversized Cash on Delivery orders", async () => {
    const p = await product("E", 250000, null, 5);
    const r = await place(alice, body(p.variant));
    expect(r.statusCode).toBe(409); expect(r.json().error.details.issues.map((i: any) => i.code)).toContain("ORDER_TOO_LARGE");
  });
  it("an email/push failure never loses the saved order", async () => {
    failEvents = true; const p = await product("F", 1000, null, 5);
    const r = await place(alice, body(p.variant)); expect(r.statusCode).toBe(201);
    expect((await call("GET", `/v1/me/orders/${r.json().id}`, alice)).statusCode).toBe(200);
  });
});

describe("customer order access", () => {
  it("lists and shows only the customer's own orders (no IDOR)", async () => {
    const p = await product("G", 1000, null, 5);
    const o = (await place(alice, body(p.variant))).json();
    expect((await call("GET", "/v1/me/orders", alice)).json().total).toBe(1);
    expect((await call("GET", "/v1/me/orders", bob)).json().total).toBe(0);
    expect((await call("GET", `/v1/me/orders/${o.id}`, bob)).statusCode).toBe(404);
    expect((await call("POST", `/v1/me/orders/${o.id}/cancel`, bob)).statusCode).toBe(404);
    expect((await call("GET", `/v1/admin/orders/${o.id}`, alice)).statusCode).toBe(401);
  });
  it("lets a customer cancel before processing (stock returns) but not after shipping", async () => {
    const p = await product("H", 1000, null, 5);
    const o = (await place(alice, body(p.variant, 2))).json(); expect(await stockOf(p.variant)).toBe(3);
    expect((await call("POST", `/v1/me/orders/${o.id}/cancel`, alice)).json().status).toBe("cancelled");
    expect(await stockOf(p.variant)).toBe(5);
    const o2 = (await place(alice, body(p.variant))).json();
    for (const s of ["confirmed", "processing", "shipped"]) await call("PATCH", `/v1/admin/orders/${o2.id}/status`, staff, { status: s });
    expect((await call("POST", `/v1/me/orders/${o2.id}/cancel`, alice)).statusCode).toBe(409);
  });
});

describe("admin order management", () => {
  it("walks the full lifecycle, tracks history, marks COD paid on delivery and fires events", async () => {
    const p = await product("I", 1000, null, 5); const o = (await place(alice, body(p.variant))).json();
    const step = (status: string, extra: object = {}) => call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status, ...extra });
    expect((await step("confirmed")).statusCode).toBe(200); expect((await step("processing")).statusCode).toBe(200);
    const shipped = await step("shipped", { trackingUrl: "https://track.example.com/123", note: "Handed to courier" });
    expect(shipped.json().trackingUrl).toBe("https://track.example.com/123");
    const done = (await step("delivered")).json();
    expect(done.paymentStatus).toBe("paid"); expect(done.history.map((h: any) => h.status)).toEqual(["pending", "confirmed", "processing", "shipped", "delivered"]);
    expect(done.allowedNext).toEqual(["refund_requested"]);
    expect(changed).toEqual(["pending>confirmed", "confirmed>processing", "processing>shipped", "shipped>delivered"]);
  });
  it("rejects invalid transitions, insecure tracking links and unknown statuses", async () => {
    const p = await product("J", 1000, null, 5); const o = (await place(alice, body(p.variant))).json();
    expect((await call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status: "delivered" })).statusCode).toBe(409);
    expect((await call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status: "shipped", trackingUrl: "http://x.com" })).statusCode).toBe(400);
    expect((await call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status: "banana" })).statusCode).toBe(400);
  });
  it("admin cancellation restores stock; list filters by status and search", async () => {
    const p = await product("K", 1000, null, 5); const o = (await place(alice, body(p.variant, 3))).json();
    await call("PATCH", `/v1/admin/orders/${o.id}/status`, admin, { status: "cancelled", note: "Customer called" });
    expect(await stockOf(p.variant)).toBe(5);
    expect((await call("GET", "/v1/admin/orders?status=cancelled", staff)).json().total).toBe(1);
    expect((await call("GET", "/v1/admin/orders?status=pending", staff)).json().total).toBe(0);
    expect((await call("GET", `/v1/admin/orders?q=${o.orderNumber}`, staff)).json().total).toBe(1);
  });
  it("handles return requests inside the window and refuses outside it", async () => {
    const p = await product("L", 1000, null, 5); const o = (await place(alice, body(p.variant))).json();
    expect((await call("POST", `/v1/me/orders/${o.id}/return`, alice, { reason: "Wrong size" })).statusCode).toBe(409);   // not delivered yet
    for (const s of ["confirmed", "processing", "shipped", "delivered"]) await call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status: s });
    const r = await call("POST", `/v1/me/orders/${o.id}/return`, alice, { reason: "Wrong size ordered" });
    expect(r.json().status).toBe("refund_requested");
    expect((await call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status: "refunded" })).json().paymentStatus).toBe("refunded");
    const o2 = (await place(alice, body(p.variant))).json();
    for (const s of ["confirmed", "processing", "shipped", "delivered"]) await call("PATCH", `/v1/admin/orders/${o2.id}/status`, staff, { status: s });
    orders.orders.find((x) => x.id === o2.id)!.history.find((h) => h.status === "delivered")!.at = new Date(Date.now() - 10 * 86400_000);
    expect((await call("POST", `/v1/me/orders/${o2.id}/return`, alice, { reason: "Too late request" })).statusCode).toBe(409);
  });
  it("exports CSV for admins only and neutralises spreadsheet formulas", async () => {
    const p = await product("M", 1000, null, 5); await place(alice, body(p.variant, 1, { customer: { name: "=HYPERLINK(\"http://evil\")", email: "a@b.co", phone: "+92 300 1234567" } }));
    expect((await call("GET", "/v1/admin/orders/export.csv", staff)).statusCode).toBe(403);
    const r = await call("GET", "/v1/admin/orders/export.csv", admin);
    expect(r.statusCode).toBe(200); expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.body).toContain("TS-"); expect(r.body).not.toMatch(/,=HYPERLINK/); expect(r.body).toContain("'=HYPERLINK");
    expect(csvCell("+1")).toBe("'+1"); expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("reports analytics that ignore cancelled orders", async () => {
    const p = await product("N", 1000, null, 10); const a = (await place(alice, body(p.variant))).json(); await place(bob, body(p.variant, 2));
    await call("PATCH", `/v1/admin/orders/${a.id}/status`, admin, { status: "cancelled" });
    const r = (await call("GET", "/v1/admin/analytics?days=7", staff)).json();
    expect(r.orders).toBe(2); expect(r.sales).toBe(2 * 1000 + 299); expect(r.pending).toBe(1); expect(r.customers).toBe(2);
    expect(r.series).toHaveLength(7); expect(r.recent).toHaveLength(2); expect(r.byStatus).toMatchObject({ cancelled: 1, pending: 1 });
    expect((await call("GET", "/v1/admin/analytics?days=5", staff)).statusCode).toBe(400);
  });
  it("lists customers for admins only", async () => {
    expect((await call("GET", "/v1/admin/customers", staff)).statusCode).toBe(403);
    expect((await call("GET", "/v1/admin/customers", admin)).json().total).toBe(2);
  });
});
