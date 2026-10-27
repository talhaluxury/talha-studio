import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryStore } from "../src/memoryStore.js";
import { emailDeps } from "./helpers.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
  GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 10000, STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media",
  PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };
let app: Awaited<ReturnType<typeof buildApp>>; let admin: string;
let catalog: MemoryCatalog; let deps: ReturnType<typeof emailDeps>;

beforeEach(async () => {
  const store = new MemoryStore(); catalog = new MemoryCatalog();
  app = await buildApp(cfg, { store, catalog, orders: new MemoryOrders(catalog, store), ...(deps = emailDeps(new MemoryOrders(catalog, store), cfg)), storage: new MemoryStorage(), images });
  await store.createUser({ email: "a@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "A", phone: null, role: "admin" });
  admin = (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: "a@t.test", password: "staff-password-1" } })).json().accessToken;
});
const call = (method: any, url: string, payload?: unknown) => app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${admin}` } });

async function publish(sku: string, price: number, salePrice: number | null, stock: number, featured = false) {
  const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
  const p = (await call("POST", "/v1/admin/products", { sku, name: `Item ${sku}`, categoryId: cat.id, price, salePrice, isFeatured: featured, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock }] })).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-thumb.webp`, width: 1, height: 1 });
  await call("PATCH", `/v1/admin/products/${p.id}/publish`, { isPublished: true });
  return p;
}

describe("home and ids", () => {
  it("builds collections from live data and omits empty ones", async () => {
    await publish("A1", 5000, 4000, 5, true); await publish("A2", 3000, null, 5);
    const h = (await app.inject({ method: "GET", url: "/v1/home" })).json();
    expect(h.banners).toEqual([]);
    expect(h.collections.map((c: any) => c.slug)).toEqual(["new-arrivals", "featured", "sale"]);
    expect(h.collections.find((c: any) => c.slug === "sale").products).toHaveLength(1);
  });
  it("fetches published products by ids and rejects bad ids", async () => {
    const a = await publish("B1", 1000, null, 1); const b = await publish("B2", 2000, null, 1);
    const r = (await app.inject({ method: "GET", url: `/v1/products?ids=${a.id},${b.id}` })).json();
    expect(r.total).toBe(2);
    expect((await app.inject({ method: "GET", url: "/v1/products?ids=not-a-uuid" })).statusCode).toBe(400);
  });
});

describe("cart quote (server-authoritative)", () => {
  it("prices from the database, ignoring anything the client claims, and adds shipping", async () => {
    const p = await publish("C1", 5000, 4000, 5);
    const v = p.variants[0].id;
    const q = (await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [{ variantId: v, qty: 2 }], unitPrice: 1 } })).json();
    expect(q.subtotal).toBe(8000); expect(q.shipping).toBe(299); expect(q.total).toBe(8299); expect(q.issues).toEqual([]);
  });
  it("gives free shipping above the threshold", async () => {
    const sv = await deps.settings.load(); await deps.settings.save({ ...sv, shipping: { flat: 299, freeOver: 10000 } });
    const p = await publish("C2", 6000, null, 5);
    const q = (await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [{ variantId: p.variants[0].id, qty: 2 }] } })).json();
    expect(q.subtotal).toBe(12000); expect(q.shipping).toBe(0);
  });
  it("reports stock problems and unknown items instead of pricing them", async () => {
    const p = await publish("C3", 1000, null, 1);
    const q = (await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [
      { variantId: p.variants[0].id, qty: 3 }, { variantId: "11111111-1111-4111-8111-111111111111", qty: 1 }] } })).json();
    expect(q.items).toEqual([]); expect(q.total).toBe(0);
    expect(q.issues.map((i: any) => i.code).sort()).toEqual(["INSUFFICIENT_STOCK", "UNAVAILABLE"]);
  });
  it("does not sell unpublished products and validates input", async () => {
    const p = await publish("C4", 1000, null, 5);
    await call("PATCH", `/v1/admin/products/${p.id}/publish`, { isPublished: false });
    const q = (await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [{ variantId: p.variants[0].id, qty: 1 }] } })).json();
    expect(q.issues[0].code).toBe("UNAVAILABLE");
    expect((await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [{ variantId: p.variants[0].id, qty: 0 }] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/cart/quote", payload: { items: [] } })).statusCode).toBe(400);
  });
});
