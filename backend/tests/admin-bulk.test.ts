/**
 * (harness copied from the acceptance test) End-to-end acceptance scenarios from the project brief (section 17), driven through the real HTTP API with in-memory stores.
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

describe("admin bulk tools and category pictures", () => {
  async function setup() {
    const w = await world(); const { call, store } = w;
    await store.createUser({ email: "owner@talha.test", passwordHash: await hashPassword("owner-password-123"), googleSub: null, fullName: "Owner", phone: null, role: "owner" });
    const admin = (await call("POST", "/v1/admin/auth/login", undefined, { email: "owner@talha.test", password: "owner-password-123" })).json().accessToken as string;
    const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Women" })).json();
    return { ...w, admin, cat };
  }
  const addImage = async (call: any, admin: string, id: string) => { const m = multipart("IMG-x"); return call("POST", `/v1/admin/products/${id}/images`, admin, m.payload, { "content-type": m.type }); };

  it("adds several products at once, then publishes them, marks them New Arrival, puts them on sale and deletes them together", async () => {
    const { call, admin, cat } = await setup();
    const rows = [{ name: "Lawn Suit One", price: 4000, sizes: ["S", "M"], stock: 3 }, { name: "Lawn Suit Two", price: 5000 }, { name: "Lawn Suit Three", price: 6000, salePrice: 4500, isFeatured: true }];
    const bad = await call("POST", "/v1/admin/products/bulk", admin, { categoryId: cat.id, products: [{ name: "Wrong Sale", price: 1000, salePrice: 1000 }] });
    expect(bad.statusCode).toBe(400); expect(bad.json().error?.message ?? bad.json().message).toContain("Row 1");
    const made = await call("POST", "/v1/admin/products/bulk", admin, { categoryId: cat.id, products: rows }); expect(made.statusCode).toBe(201);
    const { items, failed } = made.json(); expect(failed).toEqual([]); expect(items.map((i: any) => i.index)).toEqual([0, 1, 2]);
    const first = (await call("GET", `/v1/admin/products/${items[0].id}`, admin)).json();
    expect(first.isPublished).toBe(false); expect(first.variants.map((v: any) => [v.size, v.stock])).toEqual([["S", 3], ["M", 3]]);

    for (const i of [0, 1]) expect((await addImage(call, admin, items[i].id)).statusCode).toBe(201);   // the third product gets no picture
    const ids = items.map((i: any) => i.id);
    const r = (await call("POST", "/v1/admin/products/bulk-update", admin, { ids, set: { isPublished: true, isNew: true, discountPercent: 25 } })).json();
    expect(r.updated).toBe(2); expect(r.skipped).toHaveLength(1); expect(r.skipped[0].name).toBe("Lawn Suit Three"); expect(r.skipped[0].reason).toContain("image");
    const one = (await call("GET", `/v1/admin/products/${ids[0]}`, admin)).json(); expect(one).toMatchObject({ isPublished: true, isNew: true, price: 4000, salePrice: 3000 });

    const home = (await call("GET", "/v1/home")).json(); const na = home.collections.find((c: any) => c.slug === "new-arrivals");
    expect(na.products.map((p: any) => p.id).sort()).toEqual([ids[0], ids[1]].sort());               // only the ones marked New Arrival
    await call("POST", "/v1/admin/products/bulk-update", admin, { ids: [ids[0]], set: { discountPercent: 0 } });
    expect((await call("GET", `/v1/admin/products/${ids[0]}`, admin)).json().salePrice).toBeNull();

    // editing one product in the editor (which does not send isNew) keeps its New Arrival mark
    const cur = (await call("GET", `/v1/admin/products/${ids[1]}`, admin)).json();
    const put = await call("PUT", `/v1/admin/products/${ids[1]}`, admin, { sku: cur.sku, name: "Lawn Suit Two Renamed", description: "", categoryId: cat.id, price: 5000, isPublished: true, isFeatured: false, variants: cur.variants.map((v: any) => ({ sku: v.sku, size: v.size, color: v.color, stock: v.stock })) });
    expect(put.statusCode).toBe(200); expect(put.json().isNew).toBe(true);

    expect((await call("POST", "/v1/admin/products/bulk-delete", admin, { ids })).json()).toEqual({ deleted: 3 });
    expect((await call("GET", "/v1/admin/products", admin)).json().total).toBe(0);
  });

  it("a category picture can be set, shows in the app, and can be removed", async () => {
    const { call, admin, cat } = await setup();
    const m = multipart("IMG-cat"); const up = await call("POST", `/v1/admin/categories/${cat.id}/image`, admin, m.payload, { "content-type": m.type });
    expect(up.statusCode).toBe(200); expect(up.json().imageUrl).toContain("categories/");
    expect((await call("GET", "/v1/categories")).json().items[0].imageUrl).toBe(up.json().imageUrl);
    expect((await call("DELETE", `/v1/admin/categories/${cat.id}/image`, admin)).statusCode).toBe(204);
    expect((await call("GET", "/v1/categories")).json().items[0].imageUrl).toBeNull();
  });
});
