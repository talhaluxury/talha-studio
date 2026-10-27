/**
 * End-to-end acceptance scenarios from the project brief (section 17), driven through the real HTTP API with in-memory stores.
 * Scenarios 9-10 assert "the provider ACCEPTED the email" (never "delivered"); 16 (GitHub Actions) and real-inbox delivery are manual: see docs/ACCEPTANCE.md.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { EmailError, MemoryEmailProvider } from "../src/emailProvider.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { MemorySender } from "../src/pushSender.js";
import { hashPassword } from "../src/security.js";
import { DEFAULT_SETTINGS } from "../src/settingsStore.js";
import { MemoryStorage } from "../src/storage.js";
import { emailCfgFields, emailDeps } from "./helpers.js";

const cfg = {
  NODE_ENV: "test", ...emailCfgFields, FCM_SERVICE_ACCOUNT_JSON: "", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, TRUST_PROXY_HOPS: 1, MAX_OPEN_ORDERS_PER_USER: 5,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async (b) => { if (!b.subarray(0, 3).equals(Buffer.from("IMG"))) throw new EmailError("bad image", true); return { full: Buffer.from("full"), thumb: Buffer.from("thumb"), width: 1200, height: 1500 }; } };
const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));

async function world() {
  const store = new MemoryStore(), catalog = new MemoryCatalog(), storage = new MemoryStorage(); const orders = new MemoryOrders(catalog, store);
  const provider = new MemoryEmailProvider(), sender = new MemorySender(); const deps = emailDeps(orders, cfg, provider, undefined, store, sender);
  await deps.settings.save({ ...DEFAULT_SETTINGS, ownerEmail: "owner@talha.test" });
  const app = await buildApp(cfg, { store, catalog, orders, storage, images, ...deps });
  const call = (method: any, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({ method, url, payload: payload as any, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  const settle = async () => { for (let i = 0; i < 40; i++) { await wait(5); if (!deps.emails.rows.some((r) => r.status === "queued" && r.nextAttemptAt <= new Date())) break; } await deps.push.idle(); };
  return { app, store, catalog, deps, provider, sender, call, settle };
}
const multipart = (content: string) => { const b = "----acc"; return { payload: Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${content}\r\n--${b}--\r\n`), type: `multipart/form-data; boundary=${b}` }; };

describe("brief section 17: acceptance scenarios", () => {
  it("1-15 and 17: from admin sign-in to a delivered order, with emails, push and failure handling", async () => {
    const w = await world(); const { call, store, catalog, provider, sender, deps } = w;
    // (setup) the store owner's admin account exists (created by `npm run seed:admin` in real life)
    await store.createUser({ email: "owner@talha.test", passwordHash: await hashPassword("owner-password-123"), googleSub: null, fullName: "Owner", phone: null, role: "owner" });

    // 1. Admin signs in securely: wrong password is refused, right one works, and a customer account cannot use the admin door
    expect((await call("POST", "/v1/admin/auth/login", undefined, { email: "owner@talha.test", password: "wrong-password-1" })).statusCode).toBe(401);
    const admin = (await call("POST", "/v1/admin/auth/login", undefined, { email: "owner@talha.test", password: "owner-password-123" })).json().accessToken as string; expect(admin).toBeTruthy();

    // 2. Admin creates a product and uploads images
    const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Women" })).json();
    const prod = (await call("POST", "/v1/admin/products", admin, { sku: "TS-1001", name: "Embroidered Lawn Suit", description: "Black lawn with gold embroidery", categoryId: cat.id, price: 6999, salePrice: 4999, fabric: "Lawn",
      variants: [{ sku: "TS-1001-M-BLK", size: "M", color: "Black", stock: 10 }] })).json();
    for (const f of ["IMG-front", "IMG-back"]) { const m = multipart(f); const r = await call("POST", `/v1/admin/products/${prod.id}/images`, admin, m.payload, { "content-type": m.type }); expect(r.statusCode).toBe(201); }
    expect((await call("PATCH", `/v1/admin/products/${prod.id}/publish`, admin, { isPublished: true })).statusCode).toBe(200);

    // 3. The product appears in the customer app (home feed + catalogue), with image URLs
    const home = (await call("GET", "/v1/home")).json(); expect(home.collections.flatMap((c: any) => c.products).some((p: any) => p.id === prod.id)).toBe(true);
    // 4. Customer searches for and opens the product
    const found = (await call("GET", "/v1/products?q=lawn&inStock=true")).json(); expect(found.items.map((p: any) => p.id)).toContain(prod.id); expect(found.items[0].images).toHaveLength(2);
    const detail = (await call("GET", `/v1/products/${prod.id}`)).json(); expect(detail.name).toBe("Embroidered Lawn Suit"); const variantId = detail.variants[0].id;

    // Customer registers, registers a phone for push, and allows notifications
    const reg = (await call("POST", "/v1/auth/register", undefined, { fullName: "Ubaid Khan", email: "ubaid@example.com", password: "correct-horse-1" })).json(); const cust = reg.accessToken as string;
    await call("POST", "/v1/me/devices", cust, { fcmToken: "device-token-ubaid-0000000001" });

    // 5. Customer adds to cart: the server quotes the price (sale price, delivery) regardless of what the client believes
    const quote = (await call("POST", "/v1/cart/quote", undefined, { items: [{ variantId, qty: 2 }] })).json(); expect(quote).toMatchObject({ subtotal: 9998, shipping: 299, total: 10297, issues: [] });

    // 6. Checkout with Cash on Delivery
    const placed = await call("POST", "/v1/orders", cust, { items: [{ variantId, qty: 2 }], customer: { name: "Ubaid Khan", email: "ubaid@example.com", phone: "+92 300 1234567" },
      address: { line1: "House 123, Street 1", city: "Lahore", province: "Punjab" }, paymentMethod: "cod", total: 1 }, { "idempotency-key": "acceptance-order-0001" });
    // 7. Backend validated and saved the order (client-claimed total ignored, stock reserved)
    expect(placed.statusCode).toBe(201); const order = placed.json(); expect(order).toMatchObject({ status: "pending", total: 10297, paymentMethod: "cod", paymentStatus: "unpaid" }); expect(order.orderNumber).toMatch(/^TS-\d+$/);
    expect((await catalog.getVariantsByIds([variantId]))[0]!.stock).toBe(8);

    // 8. The order shows up in the admin dashboard immediately
    const adminList = (await call("GET", "/v1/admin/orders?status=pending", admin)).json(); expect(adminList.items.map((o: any) => o.id)).toContain(order.id);
    const dash = (await call("GET", "/v1/admin/analytics?days=7", admin)).json(); expect(dash).toMatchObject({ orders: 1, pending: 1, sales: 10297 });

    // 17. The backend works independently of the admin browser: nothing below needs an admin session, yet emails and push are produced
    await w.settle();
    // 9. Customer confirmation email (provider ACCEPTED it) and 10. owner new-order email
    const toCustomer = provider.sent.find((m) => m.to === "ubaid@example.com")!, toOwner = provider.sent.find((m) => m.to === "owner@talha.test")!;
    expect(toCustomer.subject).toContain(order.orderNumber); expect(toCustomer.html).toContain("Embroidered Lawn Suit"); expect(toCustomer.html).toContain("Rs. 10,297");
    expect(toOwner.subject).toContain(order.orderNumber); expect(toOwner.html).toContain("+92 300 1234567"); expect(toOwner.html).toContain("House 123, Street 1");
    expect(deps.emails.rows.filter((r) => r.status === "sent").every((r) => r.providerState === "accepted")).toBe(true);      // accepted, NOT claimed as delivered
    // The customer also got the order-confirmed push + inbox entry
    expect(sender.sent.at(-1)!.m).toMatchObject({ title: "Order confirmed", deepLink: `talhastudio://order/${order.id}` });

    // 11. Admin changes the order status
    const patch = (status: string, extra: object = {}) => call("PATCH", `/v1/admin/orders/${order.id}/status`, admin, { status, ...extra });
    for (const s of ["confirmed", "processing"]) expect((await patch(s)).statusCode).toBe(200);
    expect((await patch("shipped", { trackingUrl: "https://track.example.com/TS123" })).statusCode).toBe(200); await w.settle();
    // 12. The customer sees the updated status, with history and tracking link
    const mine = (await call("GET", `/v1/me/orders/${order.id}`, cust)).json(); expect(mine.status).toBe("shipped"); expect(mine.trackingUrl).toBe("https://track.example.com/TS123"); expect(mine.history.map((h: any) => h.status)).toEqual(["pending", "confirmed", "processing", "shipped"]);
    // 13. The customer receives the configured notification (push + inbox + email)
    expect(sender.sent.at(-1)!.m.title).toBe("Your order is on its way"); expect(provider.sent.at(-1)!.subject).toContain("Shipped"); expect(provider.sent.at(-1)!.html).toContain("https://track.example.com/TS123");
    expect((await call("GET", "/v1/me/notifications", cust)).json().items.map((n: any) => n.title)).toContain("Your order is on its way");
    await patch("delivered"); expect((await call("GET", `/v1/me/orders/${order.id}`, cust)).json()).toMatchObject({ status: "delivered", paymentStatus: "paid" });

    // 14. Invalid and unauthorised requests are rejected
    const other = (await call("POST", "/v1/auth/register", undefined, { fullName: "Mallory", email: "mallory@example.com", password: "correct-horse-1" })).json().accessToken;
    expect((await call("GET", `/v1/me/orders/${order.id}`, other)).statusCode).toBe(404);                                  // cannot read someone else's order
    expect((await call("PATCH", `/v1/admin/orders/${order.id}/status`, cust, { status: "cancelled" })).statusCode).toBe(401); // customer token cannot reach admin
    expect((await call("POST", "/v1/admin/products", undefined, { sku: "X", name: "X" })).statusCode).toBe(401);
    expect((await call("POST", "/v1/orders", cust, { items: [{ variantId, qty: 1 }], paymentMethod: "cod" }, { "idempotency-key": "acceptance-order-0002" })).statusCode).toBe(400);   // missing details
    expect((await call("POST", "/v1/orders", cust, { items: [{ variantId, qty: 999 }] })).statusCode).toBe(400);
  });

  it("15: a failed email never loses the saved order, and the admin can retry once the provider recovers", async () => {
    const w = await world(); const { call, provider, deps, store, catalog } = w;
    await store.createUser({ email: "a@talha.test", passwordHash: await hashPassword("admin-password-123"), googleSub: null, fullName: "A", phone: null, role: "admin" });
    const admin = (await call("POST", "/v1/admin/auth/login", undefined, { email: "a@talha.test", password: "admin-password-123" })).json().accessToken;
    const cat = (await catalog.createCategory({ name: "Men", slug: "men", parentId: null, sortOrder: 0, isActive: true }));
    const p = (await call("POST", "/v1/admin/products", admin, { sku: "M1", name: "Wash & Wear Suit", categoryId: cat.id, price: 6499, variants: [{ sku: "M1-L", size: "L", color: "Navy", stock: 5 }] })).json();
    await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 }); await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
    const cust = (await call("POST", "/v1/auth/register", undefined, { fullName: "Ali Khan", email: "ali@example.com", password: "correct-horse-1" })).json().accessToken;

    provider.failWith = new EmailError("Resend 422: domain not verified", true);            // provider outage / misconfiguration
    const r = await call("POST", "/v1/orders", cust, { items: [{ variantId: p.variants[0].id, qty: 1 }], customer: { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" }, address: { line1: "House 1", city: "Karachi" }, paymentMethod: "cod" }, { "idempotency-key": "acceptance-fail-0001" });
    expect(r.statusCode).toBe(201); await w.settle();
    expect((await call("GET", `/v1/me/orders/${r.json().id}`, cust)).statusCode).toBe(200);       // the order is intact
    const failed = deps.emails.rows.filter((x) => x.status === "failed"); expect(failed.length).toBeGreaterThan(0); expect(failed[0]!.lastError).toContain("domain not verified");

    provider.failWith = null;                                                                      // admin fixes the DNS and presses Retry
    for (const row of failed) expect((await call("POST", `/v1/admin/email-logs/${row.id}/retry`, admin)).json().retried).toBe(true);
    await w.settle(); expect(deps.emails.rows.every((x) => x.status === "sent")).toBe(true); expect(provider.sent.filter((m) => m.to === "ali@example.com")).toHaveLength(1);
  });

  it("offline-safe checkout: replaying the same request after a dropped connection creates exactly one order", async () => {
    const w = await world(); const { call, catalog, store } = w;
    await store.createUser({ email: "a@talha.test", passwordHash: await hashPassword("admin-password-123"), googleSub: null, fullName: "A", phone: null, role: "admin" });
    const admin = (await call("POST", "/v1/admin/auth/login", undefined, { email: "a@talha.test", password: "admin-password-123" })).json().accessToken;
    const cat = await catalog.createCategory({ name: "Men", slug: "men", parentId: null, sortOrder: 0, isActive: true });
    const p = (await call("POST", "/v1/admin/products", admin, { sku: "M2", name: "Linen Shirt", categoryId: cat.id, price: 3499, variants: [{ sku: "M2-M", size: "M", color: "Sand", stock: 3 }] })).json();
    await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 }); await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
    const cust = (await call("POST", "/v1/auth/register", undefined, { fullName: "Ali Khan", email: "ali@example.com", password: "correct-horse-1" })).json().accessToken;
    const body = { items: [{ variantId: p.variants[0].id, qty: 1 }], customer: { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" }, address: { line1: "House 1", city: "Karachi" }, paymentMethod: "cod" };
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => call("POST", "/v1/orders", cust, body, { "idempotency-key": "retry-storm-key-001" })));
    expect(new Set([a, b, c].map((r) => r.json().id)).size).toBe(1); expect((await call("GET", "/v1/me/orders", cust)).json().total).toBe(1);
    expect((await catalog.getVariantsByIds([p.variants[0].id]))[0]!.stock).toBe(2);
  });
});
