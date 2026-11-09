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
let app: Awaited<ReturnType<typeof buildApp>>; let owner: string; let deps: ReturnType<typeof emailDeps>;

beforeEach(async () => {
  const store = new MemoryStore(); const catalog = new MemoryCatalog();
  app = await buildApp(cfg, { store, catalog, orders: new MemoryOrders(catalog, store), ...(deps = emailDeps(new MemoryOrders(catalog, store), cfg)), storage: new MemoryStorage(), images });
  await store.createUser({ email: "o@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "O", phone: null, role: "owner" });
  owner = (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: "o@t.test", password: "staff-password-1" } })).json().accessToken;
});
const asOwner = (method: any, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({ method, url, payload: payload as any, headers: { authorization: `Bearer ${owner}`, ...headers } });

describe("watch & shop video cards", () => {
  const mp4 = () => { const b = "----reel"; const file = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(32)]);
    return { payload: Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp4"\r\nContent-Type: video/mp4\r\n\r\n`), file, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { "content-type": `multipart/form-data; boundary=${b}` } }; };

  it("shows a card on the home feed only once it has a video, and opens its category or section", async () => {
    const a = (await asOwner("POST", "/v1/admin/reels", { title: "Winter looks", target: "cat:women", sortOrder: 1 })).json();
    const b = (await asOwner("POST", "/v1/admin/reels", { title: "Sale picks", target: "sec:sale", sortOrder: 2 })).json();
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().reels).toEqual([]);           // no video yet
    for (const r of [a, b]) { const m = mp4(); const up = await asOwner("POST", `/v1/admin/reels/${r.id}/video`, m.payload, m.headers); expect(up.statusCode).toBe(200); expect(up.json().videoUrl).toContain(".mp4"); }
    const reels = (await app.inject({ method: "GET", url: "/v1/home" })).json().reels;
    expect(reels.map((r: any) => [r.title, r.browse])).toEqual([["Winter looks", "women"], ["Sale picks", "@sale|On Sale"]]);
    await asOwner("PUT", `/v1/admin/reels/${a.id}`, { title: "Winter looks", target: "cat:women", sortOrder: 1, isActive: false });
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().reels).toHaveLength(1);       // hidden cards disappear
    expect((await asOwner("DELETE", `/v1/admin/reels/${b.id}`)).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().reels).toHaveLength(0);
  });

  it("rejects non-video files, bad targets and anonymous visitors", async () => {
    const r = (await asOwner("POST", "/v1/admin/reels", { title: "Clip" })).json();
    const b = "----x"; const bad = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.mp4"\r\nContent-Type: video/mp4\r\n\r\nnot a video at all, just text\r\n--${b}--\r\n`);
    expect((await asOwner("POST", `/v1/admin/reels/${r.id}/video`, bad as any, { "content-type": `multipart/form-data; boundary=${b}` })).statusCode).toBe(400);
    expect((await asOwner("POST", "/v1/admin/reels", { title: "Clip", target: "http://evil" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/v1/admin/reels" })).statusCode).toBe(401);
  });
});

describe("change product information for many products", () => {
  async function two() {
    const cats = (await asOwner("GET", "/v1/admin/categories")).json().items; const cat = cats[0] ?? (await asOwner("POST", "/v1/admin/categories", { name: "Women" })).json();
    const mk = async (sku: string, price: number, salePrice: number | null) => (await asOwner("POST", "/v1/admin/products", { sku, name: `Item ${sku}`, categoryId: cat.id, price, salePrice, variants: [{ sku: `${sku}-M`, size: "M", color: null, stock: 3 }, { sku: `${sku}-L`, size: "L", color: null, stock: 4 }] })).json();
    return [await mk("B1", 5000, null), await mk("B2", 6000, 4500)];
  }
  const get = async (id: string) => (await asOwner("GET", `/v1/admin/products/${id}`)).json();

  it("applies description, fabric, price and stock to every selected product", async () => {
    const [p1, p2] = await two();
    const r = await asOwner("POST", "/v1/admin/products/bulk-update", { ids: [p1.id, p2.id], set: { description: "Soft and warm", fabric: "Wool", stock: 9, price: 7000 } });
    expect(r.json()).toMatchObject({ updated: 2, skipped: [] });
    for (const id of [p1.id, p2.id]) { const p = await get(id); expect(p).toMatchObject({ description: "Soft and warm", fabric: "Wool", price: 7000 }); expect(p.variants.map((v: any) => v.stock)).toEqual([9, 9]); }
    expect((await get(p2.id)).salePrice).toBe(4500);                                // the sale price stays
  });

  it("skips a product whose sale price would no longer be below the new price, and changes nothing else", async () => {
    const [p1, p2] = await two();
    const r = (await asOwner("POST", "/v1/admin/products/bulk-update", { ids: [p1.id, p2.id], set: { price: 4000 } })).json();
    expect(r.updated).toBe(1); expect(r.skipped).toHaveLength(1); expect(r.skipped[0].id).toBe(p2.id);
    expect((await get(p2.id)).price).toBe(6000);
  });

  it("a discount together with a new price is worked out from the new price", async () => {
    const [p1] = await two();
    await asOwner("POST", "/v1/admin/products/bulk-update", { ids: [p1.id], set: { price: 10000, discountPercent: 20 } });
    expect(await get(p1.id)).toMatchObject({ price: 10000, salePrice: 8000 });
  });
});
