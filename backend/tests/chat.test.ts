import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";
import { emailDeps } from "./helpers.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
  GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 10000, STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media",
  PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };

let app: Awaited<ReturnType<typeof buildApp>>; let store: MemoryStore; let deps: ReturnType<typeof emailDeps>; let admin: string; let staff: string; let storage: MemoryStorage;

beforeEach(async () => {
  store = new MemoryStore(); const catalog = new MemoryCatalog(); storage = new MemoryStorage();
  app = await buildApp(cfg, { store, catalog, orders: new MemoryOrders(catalog, store), ...(deps = emailDeps(new MemoryOrders(catalog, store), cfg)), storage, images });
  await store.createUser({ email: "a@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "A", phone: null, role: "admin" });
  await store.createUser({ email: "s@t.test", passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "S", phone: null, role: "staff" });
  const login = async (email: string) => (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email, password: "staff-password-1" } })).json().accessToken as string;
  admin = await login("a@t.test"); staff = await login("s@t.test");
});

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const mp = (fields: Record<string, string>, content = "IMG") => {
  const b = "----chatb"; let body = "";
  for (const [k, v] of Object.entries(fields)) body += `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  body += `--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${content}\r\n--${b}--\r\n`;
  return { payload: Buffer.from(body), type: `multipart/form-data; boundary=${b}` };
};
const post = (url: string, token: string, payload?: unknown) => app.inject({ method: "POST", url, payload: payload as object, headers: bearer(token) });
const upload = (url: string, token: string, fields: Record<string, string> = {}) => { const m = mp(fields); return app.inject({ method: "POST", url, payload: m.payload, headers: { ...bearer(token), "content-type": m.type } }); };
const get = (url: string, token: string) => app.inject({ method: "GET", url, headers: bearer(token) });
async function phoneSignUp(phone = "0300 1234567", name = "Ali") {
  const r = await app.inject({ method: "POST", url: "/v1/auth/phone/register", payload: { fullName: name, phone, password: "secret1" } });
  return { res: r, token: r.json().accessToken as string, id: r.json().user?.id as string };
}

describe("phone sign-in", () => {
  it("registers, normalises the number and signs in with any spelling of it", async () => {
    const { res } = await phoneSignUp("0300 1234567");
    expect(res.statusCode).toBe(201); expect(res.json().user.phone).toBe("+923001234567");
    const again = await app.inject({ method: "POST", url: "/v1/auth/phone/login", payload: { phone: "+92 300 1234567", password: "secret1" } });
    expect(again.statusCode).toBe(200); expect(again.json().accessToken).toBeTruthy();
  });
  it("rejects a duplicate number, a wrong password and a junk number", async () => {
    await phoneSignUp();
    expect((await phoneSignUp("03001234567")).res.statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/v1/auth/phone/login", payload: { phone: "03001234567", password: "nope-nope" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/auth/phone/register", payload: { fullName: "X Y", phone: "12", password: "secret1" } })).statusCode).toBe(400);
  });
});

describe("customer <-> store chat", () => {
  it("needs sign-in, then messages flow both ways and unread counts update", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me/chat" })).statusCode).toBe(401);
    const { token, id } = await phoneSignUp();
    expect((await post("/v1/me/chat", token, { body: "  Salam, suit ka rate?  " })).json().body).toBe("Salam, suit ka rate?");
    expect((await post("/v1/me/chat", token, { body: "   " })).statusCode).toBe(400);

    const inbox = (await get("/v1/admin/chat", staff)).json();
    expect(inbox.unreadTotal).toBe(1); expect(inbox.items[0]).toMatchObject({ customerId: id, name: "Ali", unread: 1 });

    const reply = await post(`/v1/admin/chat/${id}`, staff, { body: "Walaikum assalam!" });
    expect(reply.statusCode).toBe(201);
    expect((await get("/v1/me/chat/unread", token)).json().unread).toBe(1);
    const all = (await get("/v1/me/chat", token)).json().items;
    expect(all.map((m: any) => m.sender)).toEqual(["customer", "store"]);
    const newer = (await get(`/v1/me/chat?after=${all[0].seq}`, token)).json().items;
    expect(newer).toHaveLength(1);

    await post("/v1/me/chat/read", token); expect((await get("/v1/me/chat/unread", token)).json().unread).toBe(0);
    await post(`/v1/admin/chat/${id}/read`, staff); expect((await get("/v1/admin/chat", staff)).json().unreadTotal).toBe(0);
  });
  it("customers only ever see their own conversation and cannot use the admin routes", async () => {
    const a = await phoneSignUp("03001111111", "A"); const b = await phoneSignUp("03002222222", "B");
    await post("/v1/me/chat", a.token, { body: "private" });
    expect((await get("/v1/me/chat", b.token)).json().items).toHaveLength(0);
    expect((await get("/v1/admin/chat", a.token)).statusCode).toBe(401);          // customer token has the wrong audience
    expect((await post(`/v1/admin/chat/${a.id}`, b.token, { body: "x" })).statusCode).toBe(401);
  });
  it("sends pictures both ways and stores them under the customer's folder", async () => {
    const { token, id } = await phoneSignUp();
    const r = await upload("/v1/me/chat/image", token); expect(r.statusCode).toBe(201); expect(r.json().imageUrl).toContain(`chat/${id}/`);
    expect((await upload(`/v1/admin/chat/${id}/image`, staff)).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/v1/me/chat/image", headers: bearer(token) })).statusCode).toBeGreaterThanOrEqual(400);
  });
  it("account deletion removes the chat and its pictures", async () => {
    const { token, id } = await phoneSignUp(); await upload("/v1/me/chat/image", token); await post("/v1/me/chat", token, { body: "hi" });
    expect([...storage.files.keys()].some((k) => k.startsWith(`chat/${id}/`))).toBe(true);
    expect((await post("/v1/me/delete", token, { password: "secret1" })).statusCode).toBe(204);
    expect(deps.chat.rows).toHaveLength(0); expect([...storage.files.keys()].some((k) => k.startsWith(`chat/${id}/`))).toBe(false);
  });
});

describe("daily status pictures", () => {
  it("admin posts, customers see it for 24 h, views are counted, expired ones disappear", async () => {
    const { token } = await phoneSignUp();
    expect((await upload("/v1/admin/status", staff, { caption: "x" })).statusCode).toBe(403);   // staff cannot post, admin/owner can
    const s = await upload("/v1/admin/status", admin, { caption: "New Eid collection" }); expect(s.statusCode).toBe(201);
    expect(s.json().caption).toBe("New Eid collection");
    const list = (await get("/v1/me/status", token)).json().items; expect(list).toHaveLength(1);
    expect((await post(`/v1/me/status/${list[0].id}/view`, token)).statusCode).toBe(204);
    await post(`/v1/me/status/${list[0].id}/view`, token);                                        // idempotent
    expect((await get("/v1/admin/status", admin)).json().items[0].views).toBe(1);
    deps.status.rows[0]!.expiresAt = new Date(Date.now() - 1000);
    expect((await get("/v1/me/status", token)).json().items).toHaveLength(0);
    expect([...storage.files.keys()].some((k) => k.startsWith("status/"))).toBe(false);          // file cleaned up
  });
  it("admin can delete a status; signed-out users cannot see statuses", async () => {
    const s = (await upload("/v1/admin/status", admin)).json();
    expect((await app.inject({ method: "GET", url: "/v1/me/status" })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: `/v1/admin/status/${s.id}`, headers: bearer(admin) })).statusCode).toBe(204);
    expect((await get("/v1/admin/status", admin)).json().items).toHaveLength(0);
  });
});

describe("onboarding slides", () => {
  it("admin creates a slide and its picture; the public endpoint serves only active ones in order", async () => {
    const a = await post("/v1/admin/onboarding", admin, { title: "Premium Fashion\nFor Modern Life", body: "Discover collections.", sortOrder: 1 }); expect(a.statusCode).toBe(201);
    const b = await post("/v1/admin/onboarding", admin, { title: "Hidden", sortOrder: 0, isActive: false });
    expect(b.statusCode).toBe(201);
    const up = await upload(`/v1/admin/onboarding/${a.json().id}/image`, admin); expect(up.statusCode).toBe(201);
    const pub = (await app.inject({ method: "GET", url: "/v1/onboarding" })).json().slides;
    expect(pub).toHaveLength(1); expect(pub[0]).toMatchObject({ title: "Premium Fashion\nFor Modern Life" }); expect(pub[0].imageUrl).toContain("onboarding/");
    expect((await app.inject({ method: "DELETE", url: `/v1/admin/onboarding/${a.json().id}/image`, headers: bearer(admin) })).statusCode).toBe(204);
    expect([...storage.files.keys()].some((k) => k.startsWith("onboarding/"))).toBe(false);
  });
  it("staff cannot manage slides", async () => { expect((await post("/v1/admin/onboarding", staff, { title: "Nope" })).statusCode).toBe(403); });
});
