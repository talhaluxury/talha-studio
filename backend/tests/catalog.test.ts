import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { AppError } from "../src/errors.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryStore } from "../src/memoryStore.js";
import { emailDeps } from "./helpers.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
  GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media",
  S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};
// Fake processor: bytes starting with "IMG" are "valid images"; anything else is rejected like sharp would.
const images: ImageProcessor = {
  async process(b) {
    if (!b.subarray(0, 3).equals(Buffer.from("IMG"))) throw new AppError(415, "INVALID_IMAGE", "Upload a valid JPG, PNG or WebP image");
    return { full: Buffer.from("full-" + b.length), thumb: Buffer.from("thumb"), width: 1200, height: 1500 };
  },
};

let store: MemoryStore, storage: MemoryStorage, app: Awaited<ReturnType<typeof buildApp>>;
let admin: string;
beforeEach(async () => {
  store = new MemoryStore(); storage = new MemoryStorage();
  const cat = new MemoryCatalog(); app = await buildApp(cfg, { store, catalog: cat, orders: new MemoryOrders(cat, store), ...emailDeps(new MemoryOrders(cat, store), cfg), storage, images });
  admin = await login("admin");
});

async function login(role: "admin" | "staff", email = `${role}@talha.test`) {
  await store.createUser({ email, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "T", phone: null, role });
  return (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password: "staff-password-1" } })).json().accessToken as string;
}
const call = (method: any, url: string, token?: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });

function upload(url: string, token: string, content: Buffer, filename = "a.jpg") {
  const b = "----tsboundary";
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`), content, Buffer.from(`\r\n--${b}--\r\n`),
  ]);
  return app.inject({ method: "POST", url, payload: body, headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${b}` } });
}
const product = (o: Partial<Record<string, unknown>> = {}) => ({
  sku: "TS-001", name: "Embroidered Lawn Suit", description: "Demo", categoryId: "", price: 6999, salePrice: 4999, fabric: "Lawn",
  variants: [{ sku: "TS-001-M-BLK", size: "M", color: "Black", stock: 10 }, { sku: "TS-001-L-BLK", size: "L", color: "Black", stock: 5 }], ...o,
});
async function seed(extra: Partial<Record<string, unknown>> = {}) {
  const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Women" })).json();
  const p = (await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id, ...extra }))).json();
  return { cat, p };
}

describe("product lifecycle (acceptance 2-4)", () => {
  it("create → upload → publish → visible to customers with image URLs", async () => {
    const { p } = await seed();
    expect((await call("GET", "/v1/products")).json().total).toBe(0);                 // draft is hidden
    const up = await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-bytes"));
    expect(up.statusCode).toBe(201);
    expect(up.json().url).toMatch(/^https:\/\/media\.test\/products\/.+\.webp$/);
    expect(storage.files.size).toBe(2);                                                // full + thumb
    expect((await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true })).statusCode).toBe(200);
    const list = (await call("GET", "/v1/products?q=lawn")).json();
    expect(list.total).toBe(1);
    expect(list.items[0].images).toHaveLength(1);
    expect(list.items[0].inStock).toBe(true);
    expect(list.items[0].variants[0].sku).toBeUndefined();                             // internal SKUs not exposed publicly
    expect((await call("GET", `/v1/products/${p.id}`)).json().name).toBe("Embroidered Lawn Suit");
  });
  it("cannot publish without images or variants", async () => {
    const { p } = await seed();
    expect((await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true })).statusCode).toBe(409);
  });
  it("unpublished products are 404 to customers", async () => {
    const { p } = await seed();
    expect((await call("GET", `/v1/products/${p.id}`)).statusCode).toBe(404);
  });
});

describe("validation and uniqueness", () => {
  it("rejects sale price >= price and duplicate variant SKUs with field errors", async () => {
    const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Men" })).json();
    const r = await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id, salePrice: 7000, variants: [{ sku: "A1", stock: 1 }, { sku: "a1", stock: 2 }] }));
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().error.fields)).toEqual(expect.arrayContaining(["salePrice", "variants.1.sku"]));
  });
  it("rejects duplicate product SKU", async () => {
    const { cat } = await seed();
    expect((await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id }))).statusCode).toBe(409);
  });
  it("rejects negative stock and non-integer price", async () => {
    const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Kids" })).json();
    expect((await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id, price: 10.5 }))).statusCode).toBe(400);
    expect((await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id, variants: [{ sku: "X1", stock: -1 }] }))).statusCode).toBe(400);
  });
});

describe("images", () => {
  it("rejects non-images and keeps storage clean", async () => {
    const { p } = await seed();
    const r = await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("<script>alert(1)</script>"), "evil.jpg");
    expect(r.statusCode).toBe(415); expect(storage.files.size).toBe(0);
  });
  it("reorders, deletes (purging files) and enforces the published-needs-image rule", async () => {
    const { p } = await seed();
    const a = (await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-a"))).json();
    const b = (await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-b"))).json();
    const re = await call("PATCH", `/v1/admin/products/${p.id}/images/order`, admin, { imageIds: [b.id, a.id] });
    expect(re.json().images[0].id).toBe(b.id);
    expect((await call("PATCH", `/v1/admin/products/${p.id}/images/order`, admin, { imageIds: [b.id] })).statusCode).toBe(400);
    await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
    expect((await call("DELETE", `/v1/admin/products/${p.id}/images/${a.id}`, admin)).statusCode).toBe(204);
    expect(storage.files.size).toBe(2);
    expect((await call("DELETE", `/v1/admin/products/${p.id}/images/${b.id}`, admin)).statusCode).toBe(409);
  });
  it("deleting a product removes its files", async () => {
    const { p } = await seed();
    await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-a"));
    expect((await call("DELETE", `/v1/admin/products/${p.id}`, admin)).statusCode).toBe(204);
    expect(storage.files.size).toBe(0);
  });
  it("limits images per product", async () => {
    const { p } = await seed();
    for (let i = 0; i < 10; i++) expect((await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-" + i))).statusCode).toBe(201);
    expect((await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG-x"))).statusCode).toBe(409);
  });
});

describe("authorization", () => {
  it("staff can read but not change the catalog; anonymous and customers are rejected", async () => {
    const staff = await login("staff");
    const { cat, p } = await seed();
    expect((await call("GET", "/v1/admin/products", staff)).statusCode).toBe(200);
    expect((await call("POST", "/v1/admin/products", staff, product({ categoryId: cat.id, sku: "NEW-1" }))).statusCode).toBe(403);
    expect((await call("PUT", `/v1/admin/products/${p.id}`, staff, product({ categoryId: cat.id, price: 1 }))).statusCode).toBe(403);
    expect((await call("GET", "/v1/admin/products")).statusCode).toBe(401);
    const cust = (await call("POST", "/v1/auth/register", undefined, { fullName: "Ali Khan", email: "c@example.com", password: "correct-horse-1" })).json().accessToken;
    expect((await call("GET", "/v1/admin/products", cust)).statusCode).toBe(401);
  });
  it("price changes are written to the activity log", async () => {
    const { cat, p } = await seed();
    await call("PUT", `/v1/admin/products/${p.id}`, admin, product({ categoryId: cat.id, price: 7999, salePrice: null }));
    expect(store.activity.some((a: any) => a.action === "product.update.price")).toBe(true);
  });
});

describe("browse, filter, categories, stats", () => {
  it("sorts, filters and paginates", async () => {
    const cat = (await call("POST", "/v1/admin/categories", admin, { name: "Women" })).json();
    for (const [i, price] of [[1, 3000], [2, 1000], [3, 2000]] as const) {
      const p = (await call("POST", "/v1/admin/products", admin, product({ categoryId: cat.id, sku: `P-${i}`, name: `Item ${i}`, price, salePrice: null, variants: [{ sku: `P-${i}-M`, size: "M", color: "Red", stock: i === 3 ? 0 : 4 }] }))).json();
      await upload(`/v1/admin/products/${p.id}/images`, admin, Buffer.from("IMG"));
      await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
    }
    expect((await call("GET", "/v1/products?sort=price_asc")).json().items.map((x: any) => x.price)).toEqual([1000, 2000, 3000]);
    expect((await call("GET", "/v1/products?inStock=true")).json().total).toBe(2);
    expect((await call("GET", "/v1/products?minPrice=1500&maxPrice=2500")).json().total).toBe(1);
    expect((await call("GET", "/v1/products?limit=2&page=2")).json().items).toHaveLength(1);
    expect((await call("GET", "/v1/products?limit=999")).statusCode).toBe(400);
    expect((await call("GET", "/v1/products?category=women")).json().total).toBe(3);
    expect((await call("GET", "/v1/admin/stats", admin)).json()).toMatchObject({ products: 3, published: 3, outOfStock: 1, categories: 1 });
  });
  it("blocks deleting a category that still has products", async () => {
    const { cat } = await seed();
    expect((await call("DELETE", `/v1/admin/categories/${cat.id}`, admin)).statusCode).toBe(409);
  });
});
