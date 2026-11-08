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
const asOwner = (method: any, url: string, payload?: unknown) => app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${owner}` } });
async function saveSettings(patch: Record<string, unknown>) {
  const cur = (await asOwner("GET", "/v1/admin/store-settings")).json();
  const r = await asOwner("PUT", "/v1/admin/store-settings", { shipping: cur.shipping, announcement: cur.announcement, pages: cur.pages, ...patch });
  expect(r.statusCode).toBe(200);
}
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("sale timer", () => {
  it("is hidden until the owner turns it on and while its end time is in the past", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().sale).toBeNull();
    await saveSettings({ sale: { active: true, label: "Eid sale ends in", endsAt: inHours(5) } });
    const h = (await app.inject({ method: "GET", url: "/v1/home" })).json();
    expect(h.sale.label).toBe("Eid sale ends in"); expect(new Date(h.sale.endsAt).getTime()).toBeGreaterThan(Date.now());
    const s = (await app.inject({ method: "GET", url: "/v1/sale" })).json(); expect(s.sale.endsAt).toBe(h.sale.endsAt); expect(typeof s.serverNow).toBe("string");
    await saveSettings({ sale: { active: true, label: "x", endsAt: inHours(-1) } });
    expect((await app.inject({ method: "GET", url: "/v1/sale" })).json().sale).toBeNull();
    await saveSettings({ sale: { active: false, label: "x", endsAt: inHours(5) } });
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().sale).toBeNull();
  });
});

describe("lucky wheel", () => {
  const reg = async () => (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Test User", email: `u${Math.random().toString(36).slice(2)}@t.test`, password: "correct-horse-1" } })).json().accessToken as string;
  const me = (token: string, method: any, url: string) => app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

  it("needs sign-in, is off by default, and gives one single-use coupon per day", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/me/spin" })).statusCode).toBe(401);
    const t = await reg();
    expect((await me(t, "GET", "/v1/me/spin")).json()).toMatchObject({ active: false, canSpin: false });
    expect((await me(t, "POST", "/v1/me/spin")).statusCode).toBe(409);

    await saveSettings({ spin: { active: true, percents: [10, 20] } });
    expect((await app.inject({ method: "GET", url: "/v1/home" })).json().spin).toBe(true);
    expect((await me(t, "GET", "/v1/me/spin")).json()).toMatchObject({ active: true, percents: [10, 20], canSpin: true });
    const r = await me(t, "POST", "/v1/me/spin"); expect(r.statusCode).toBe(200);
    const w = r.json(); expect([10, 20]).toContain(w.percent); expect([0, 1]).toContain(w.index); expect(w.code).toMatch(/^SPIN[A-Z0-9]{6}$/);
    const c = await deps.coupons.getByCode(w.code); expect(c).toMatchObject({ type: "percent", value: w.percent, maxUses: 1, isActive: true });
    expect((await me(t, "POST", "/v1/me/spin")).statusCode).toBe(429);
    expect((await me(t, "GET", "/v1/me/spin")).json()).toMatchObject({ canSpin: false });
    const other = await reg(); expect((await me(other, "POST", "/v1/me/spin")).statusCode).toBe(200);     // another customer is not blocked
  });
});
