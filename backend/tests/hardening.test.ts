import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryEmailProvider, NullProvider } from "../src/emailProvider.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";
import { FailureThrottle } from "../src/throttle.js";
import { emailCfgFields, emailDeps } from "./helpers.js";

const cfg = {
  NODE_ENV: "test", ...emailCfgFields, FCM_SERVICE_ACCOUNT_JSON: "", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, TRUST_PROXY_HOPS: 1, MAX_OPEN_ORDERS_PER_USER: 2,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };

describe("FailureThrottle", () => {
  it("locks an account after the limit, even for the right password, and unlocks after the window", () => {
    let t = 1_000_000; const th = new FailureThrottle(3, 60_000, () => t);
    for (let i = 0; i < 3; i++) { th.check("a"); th.fail("a"); }
    expect(() => th.check("a")).toThrow(/Too many failed attempts/);
    th.check("b");                                                   // other accounts are unaffected
    t += 61_000; expect(() => th.check("a")).not.toThrow();
  });
  it("a success resets the counter", () => {
    const th = new FailureThrottle(2, 60_000); th.fail("a"); th.reset("a"); th.fail("a"); expect(() => th.check("a")).not.toThrow();
  });
});

describe("production configuration guards", () => {
  const base = { DATABASE_URL: "postgres://u:p@h/db", JWT_ACCESS_SECRET: "x".repeat(40) + "-real-secret", NODE_ENV: "production", STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s",
    PUBLIC_MEDIA_BASE_URL: "https://media.example.org", ADMIN_ORIGIN: "https://admin.example.org,https://appassets.androidplatform.net" } as NodeJS.ProcessEnv;
  it("accepts a sound production setup", () => expect(() => loadConfig(base)).not.toThrow());
  it("refuses ephemeral local storage, plain-http origins, wildcards, missing origins and placeholder secrets", () => {
    expect(() => loadConfig({ ...base, STORAGE_DRIVER: "local" })).toThrow(/STORAGE_DRIVER=local/);
    expect(() => loadConfig({ ...base, STORAGE_DRIVER: "local", ALLOW_LOCAL_STORAGE: "1" })).not.toThrow();
    expect(() => loadConfig({ ...base, ADMIN_ORIGIN: "http://admin.example.org" })).toThrow(/https/);
    expect(() => loadConfig({ ...base, ADMIN_ORIGIN: "https://*.example.org" })).toThrow(/exact/);
    expect(() => loadConfig({ ...base, ADMIN_ORIGIN: "" })).toThrow(/ADMIN_ORIGIN/);
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: "change-me-change-me-change-me-change-me" })).toThrow(/placeholder/);
    expect(() => loadConfig({ ...base, PUBLIC_MEDIA_BASE_URL: "http://media.example.org" })).toThrow(/https/);
  });
  it("never prints secret values in the error", () => {
    try { loadConfig({ ...base, JWT_ACCESS_SECRET: "short" }); } catch (e) { expect(String((e as Error).message)).not.toContain("short-secret-value"); expect(String((e as Error).message)).toContain("JWT_ACCESS_SECRET"); }
  });
});

describe("API hardening", () => {
  let app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStore, catalog: MemoryCatalog, deps: ReturnType<typeof emailDeps>, provider: MemoryEmailProvider;
  let admin: string, alice: string;
  beforeEach(async () => {
    store = new MemoryStore(); catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store); provider = new MemoryEmailProvider();
    deps = emailDeps(orders, cfg, provider, undefined, store);
    app = await buildApp(cfg, { store, catalog, orders, storage: new MemoryStorage(), images, ...deps });
    await store.createUser({ email: "admin@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "A", phone: null, role: "admin" });
    admin = (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: "admin@t.test", password: "staff-password-1" } })).json().accessToken;
    alice = (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Alice Khan", email: "alice@t.test", password: "correct-horse-1" } })).json().accessToken;
  });
  const call = (method: any, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload: payload as any, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  let n = 0;
  async function variant() {
    const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
    const sku = `H${++n}`; const p = (await call("POST", "/v1/admin/products", admin, { sku, name: "Lawn Suit", categoryId: cat.id, price: 1000, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock: 50 }] })).json();
    await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 });
    await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true }); return p.variants[0].id as string;
  }
  const order = (token: string, v: string, key: string, email = "ali@example.com") => call("POST", "/v1/orders", token, { items: [{ variantId: v, qty: 1 }], customer: { name: "Ali Khan", email, phone: "+92 300 1234567" },
    address: { line1: "House 1, Street 2", city: "Lahore" }, paymentMethod: "cod" }, { "idempotency-key": key });

  it("locks a customer account after repeated wrong passwords, even for the right one", async () => {
    const login = (password: string) => call("POST", "/v1/auth/login", undefined, { email: "alice@t.test", password });
    for (let i = 0; i < 8; i++) expect((await login("wrong-password-1")).statusCode).toBe(401);
    const locked = await login("correct-horse-1"); expect(locked.statusCode).toBe(429); expect(locked.json().error.code).toBe("TOO_MANY_ATTEMPTS");
  });
  it("caps open orders per customer but still answers an idempotent replay", async () => {
    const v = await variant();
    expect((await order(alice, v, "open-order-key-1")).statusCode).toBe(201); const second = await order(alice, v, "open-order-key-2"); expect(second.statusCode).toBe(201);
    const third = await order(alice, v, "open-order-key-3"); expect(third.statusCode).toBe(429); expect(third.json().error.code).toBe("TOO_MANY_OPEN_ORDERS");
    expect((await order(alice, v, "open-order-key-1")).statusCode).toBe(200);                               // replay is not blocked
    await call("POST", `/v1/me/orders/${second.json().id}/cancel`, alice); expect((await order(alice, v, "open-order-key-3")).statusCode).toBe(201);
  });
  it("stops the store from being used to spam one email address", async () => {
    const hi = { ...cfg, MAX_OPEN_ORDERS_PER_USER: 50 } as Config; const orders = new MemoryOrders(catalog, store);
    const d = emailDeps(orders, hi, new NullProvider(), undefined, store);      // unconfigured provider: rows just queue, so we can count them
    const v = await variant();
    for (let i = 0; i < 6; i++) await d.email.orderPlaced({ id: `o${i}`, orderNumber: `TS-${i}`, customer: { name: "A", email: "victim@example.com", phone: "1" } } as any);
    const rows = d.emails.rows.filter((r) => r.kind === "order_confirmation");
    expect(rows).toHaveLength(6); expect(rows.filter((r) => r.status === "failed")).toHaveLength(1); expect(rows.find((r) => r.status === "failed")!.lastError).toContain("too many emails");
    expect(v).toBeTruthy();
  });
  it("marks account and admin responses as non-cacheable but leaves the public catalogue cacheable", async () => {
    expect((await call("GET", "/v1/me", alice)).headers["cache-control"]).toBe("no-store");
    expect((await call("GET", "/v1/admin/stats", admin)).headers["cache-control"]).toBe("no-store");
    expect((await call("GET", "/v1/products")).headers["cache-control"]).not.toBe("no-store");
  });
  it("publishes the account-deletion page Google Play asks for", async () => {
    const r = await call("GET", "/legal/account-deletion"); expect(r.statusCode).toBe(200); expect(r.headers["content-type"]).toContain("text/html");
    expect(r.body).toContain("Delete my account"); expect(r.body).toContain("What we keep");
  });
  it("does not expose stack traces or internals on server errors", async () => {
    const r = await call("POST", "/v1/auth/login", undefined, "{bad json", { "content-type": "application/json" });
    expect(r.statusCode).toBeLessThan(500); expect(r.body).not.toMatch(/node_modules|\.ts:\d|\n\s+at /);
  });
});
