import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryBrands } from "../src/memoryBrands.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";
import { emailDeps } from "./helpers.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
  GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", SELLER_ORIGIN: "", SELLER_PORTAL_URL: "https://sell.talha.test", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media",
  PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };

let app: Awaited<ReturnType<typeof buildApp>>; let catalog: MemoryCatalog; let brands: MemoryBrands; let deps: ReturnType<typeof emailDeps>;
let admin: string; let seller: string; let buyer: string; let categoryId: string; let sellerId: string;

const call = (token: string | null, method: any, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
const register = async (name: string, email: string) => (await call(null, "POST", "/v1/auth/register", { fullName: name, email, password: "password-123" })).json();

beforeEach(async () => {
  const store = new MemoryStore(); catalog = new MemoryCatalog(); brands = new MemoryBrands();
  const orders = new MemoryOrders(catalog, store);
  app = await buildApp(cfg, { store, catalog, orders, brands, ...(deps = emailDeps(orders, cfg, undefined, undefined, store)), storage: new MemoryStorage(), images });
  await store.createUser({ email: "a@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "Admin", phone: null, role: "admin" });
  admin = (await call(null, "POST", "/v1/admin/auth/login", { email: "a@t.test", password: "staff-password-1" })).json().accessToken;
  const s = await register("Sara Seller", "sara@t.test"); seller = s.accessToken; sellerId = s.user.id;
  buyer = (await register("Bilal Buyer", "bilal@t.test")).accessToken;
  categoryId = (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true })).id;
});

const productBody = (over: object = {}) => ({ name: "Lawn Suit", description: "3 piece", categoryId, price: 4500, salePrice: 3900, fabric: "Lawn", variants: [{ size: "M", color: "Blue", stock: 5 }], ...over });
async function liveBrand() {
  const b = (await call(seller, "POST", "/v1/seller/apply", { name: "Noor Atelier", contactPhone: "+92 300 1234567", city: "Lahore" })).json();
  await call(admin, "POST", `/v1/admin/brands/${b.id}/approve`);
  const rec = (await brands.getById(b.id))!;
  await brands.saveDraft(b.id, { ...rec.draft, logoKey: `brands/${b.id}/logo.webp`, tagline: "Pure lawn" });   // uploads need multipart; set the picture directly
  const p = (await call(seller, "POST", "/v1/seller/products", productBody())).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-thumb.webp`, width: 1, height: 1 });
  expect((await call(seller, "POST", "/v1/seller/brand/submit")).statusCode).toBe(200);
  expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/page/approve`)).statusCode).toBe(200);
  return { brand: b, product: p };
}

describe("seller application and review", () => {
  it("keeps a new brand hidden until the account and the page are both approved", async () => {
    const b = (await call(seller, "POST", "/v1/seller/apply", { name: "Noor Atelier", contactPhone: "+92 300 1234567", city: "Lahore" })).json();
    expect(b.status).toBe("pending");
    expect((await call(seller, "POST", "/v1/seller/apply", { name: "Again", contactPhone: "+92 300 1234567", city: "Lahore" })).statusCode).toBe(409);
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor" })).statusCode).toBe(403);       // not approved yet
    expect((await call(null, "GET", "/v1/brands")).json().items).toEqual([]);
    expect((await call(buyer, "POST", `/v1/admin/brands/${b.id}/approve`)).statusCode).toBe(401);          // customers cannot use admin routes
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/approve`)).statusCode).toBe(200);
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor Atelier", website: "https://noor.test", sections: [{ type: "text", heading: "Our story", body: "Hand finished" }, { type: "spacer", size: "small" }] })).statusCode).toBe(200);
    expect((await call(null, "GET", "/v1/brands")).json().items).toEqual([]);                              // approved account, but no approved page yet
    expect((await call(null, "GET", "/v1/brands/noor-atelier")).statusCode).toBe(404);
  });

  it("validates the page and never lets a seller publish or feature a product", async () => {
    const b = (await call(seller, "POST", "/v1/seller/apply", { name: "Noor Atelier", contactPhone: "+92 300 1234567", city: "Lahore" })).json();
    await call(admin, "POST", `/v1/admin/brands/${b.id}/approve`);
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor", sections: [{ type: "banner", slides: [] }] })).statusCode).toBe(400);     // a banner needs a picture
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor", sections: [{ type: "video", videoKey: "brands/00000000-0000-0000-0000-000000000000/m/11111111-1111-1111-1111-111111111111.mp4" }] })).statusCode).toBe(400);   // somebody else's file
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor", sections: [{ type: "unknown" }] })).statusCode).toBe(400);
    expect((await call(seller, "PUT", "/v1/seller/brand", { name: "Noor", website: "http://insecure.test" })).statusCode).toBe(400);
    expect((await call(seller, "POST", "/v1/seller/brand/submit")).statusCode).toBe(409);                    // no logo, no products
    const p = (await call(seller, "POST", "/v1/seller/products", productBody({ isPublished: true, isFeatured: true }))).json();
    expect(p.isPublished).toBe(false); expect(p.isFeatured).toBe(false); expect(p.state).toBe("draft");
    expect((await call(seller, "POST", "/v1/seller/products", productBody({ price: 100, salePrice: 200 }))).statusCode).toBe(400);
  });

  it("publishes the brand and its products when the admin approves, and sellers cannot touch each other's products", async () => {
    const { product } = await liveBrand();
    const list = (await call(null, "GET", "/v1/brands")).json().items;
    expect(list).toHaveLength(1); expect(list[0].name).toBe("Noor Atelier");
    const page = (await call(null, "GET", "/v1/brands/noor-atelier")).json();
    expect(page.products.map((x: any) => x.id)).toEqual([product.id]);
    const detail = (await call(null, "GET", `/v1/products/${product.id}`)).json();
    expect(detail.brand).toMatchObject({ slug: "noor-atelier", name: "Noor Atelier" });
    const other = await register("Other", "other@t.test");
    const ob = (await call(other.accessToken, "POST", "/v1/seller/apply", { name: "Other Brand", contactPhone: "+92 300 1111111", city: "Karachi" })).json();
    await call(admin, "POST", `/v1/admin/brands/${ob.id}/approve`);
    expect((await call(other.accessToken, "PUT", `/v1/seller/products/${product.id}`, productBody())).statusCode).toBe(404);
  });

  it("can send the page back with a note, and suspending hides the brand", async () => {
    const b = (await call(seller, "POST", "/v1/seller/apply", { name: "Noor Atelier", contactPhone: "+92 300 1234567", city: "Lahore" })).json();
    await call(admin, "POST", `/v1/admin/brands/${b.id}/approve`);
    const rec = (await brands.getById(b.id))!; await brands.saveDraft(b.id, { ...rec.draft, logoKey: "brands/x/logo.webp" });
    const p = (await call(seller, "POST", "/v1/seller/products", productBody())).json();
    await catalog.addImage(p.id, { storageKey: "products/x/a.webp", thumbKey: "products/x/a-thumb.webp", width: 1, height: 1 });
    await call(seller, "POST", "/v1/seller/brand/submit");
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/page/reject`, { note: "x" })).statusCode).toBe(400);
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/page/reject`, { note: "Logo is blurry, please upload again" })).statusCode).toBe(200);
    const me = (await call(seller, "GET", "/v1/seller/me")).json();
    expect(me.brand.pageStatus).toBe("rejected"); expect(me.brand.pageNote).toContain("blurry");
    expect((await call(seller, "POST", "/v1/seller/brand/submit")).statusCode).toBe(200);                    // fixed, send again
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/page/approve`)).statusCode).toBe(200);
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/suspend`, { note: "Policy violation" })).statusCode).toBe(200);
    expect((await call(null, "GET", "/v1/brands/noor-atelier")).statusCode).toBe(404);
    expect((await catalog.getProduct(p.id, false))!.isPublished).toBe(false);
    expect((await call(admin, "POST", `/v1/admin/brands/${b.id}/unsuspend`)).statusCode).toBe(200);
    expect((await catalog.getProduct(p.id, false))!.isPublished).toBe(true);
  });
});

describe("orders reach the seller and the admin", () => {
  it("shows a brand's order to its seller only (own lines, no email), labels it for the admin and alerts the seller", async () => {
    const { product } = await liveBrand();
    const variantId = (await catalog.getProduct(product.id, false))!.variants[0]!.id;
    const placed = await call(buyer, "POST", "/v1/orders", {
      items: [{ variantId, qty: 2 }], customer: { name: "Bilal Buyer", email: "bilal@t.test", phone: "+923001234567" },
      address: { line1: "House 1, Street 2", city: "Lahore" }, paymentMethod: "cod",
    }, { "idempotency-key": "order-key-0001" });
    expect(placed.statusCode).toBe(201);
    const orderId = placed.json().id;

    const mine = (await call(seller, "GET", "/v1/seller/orders")).json();
    expect(mine.total).toBe(1); expect(mine.items[0].items).toHaveLength(1);
    expect(mine.items[0].subtotal).toBe(2 * 3900); expect(mine.items[0].customer.email).toBeUndefined(); expect(mine.items[0].customer.phone).toBe("+923001234567");
    const other = await register("Other", "other@t.test");
    expect((await call(other.accessToken, "GET", `/v1/seller/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(other.accessToken, "GET", "/v1/seller/orders")).statusCode).toBe(404);              // no seller account at all

    const adminList = (await call(admin, "GET", "/v1/admin/orders")).json();
    expect(adminList.items[0].brands).toEqual([expect.objectContaining({ name: "Noor Atelier" })]);
    const adminOrder = (await call(admin, "GET", `/v1/admin/orders/${orderId}`)).json();
    expect(adminOrder.items[0].brand).toMatchObject({ name: "Noor Atelier" });

    const inbox = await deps.pushStore.listNotifications(sellerId, 1, 20);
    expect(inbox.items.some((n) => n.title === "New order for Noor Atelier")).toBe(true);
  });
});
