import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryStorage } from "../src/storage.js";
import { MemoryStore } from "../src/memoryStore.js";
import { emailDeps } from "./helpers.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { hashPassword } from "../src/security.js";

const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123",
  GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0, STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media",
  S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};
const google = {
  verify: async (t: string) => {
    if (t.startsWith("good")) return { sub: "g-1", email: "Gina@Example.com", emailVerified: true, name: "Gina G" };
    if (t.startsWith("unverified")) return { sub: "g-2", email: "u@example.com", emailVerified: false, name: "U" };
    throw new Error("bad token");
  },
};

let store: MemoryStore;
let app: Awaited<ReturnType<typeof buildApp>>;
beforeEach(async () => { store = new MemoryStore(); const catalog = new MemoryCatalog(); app = await buildApp(cfg, { store, catalog, orders: new MemoryOrders(catalog, store), ...emailDeps(new MemoryOrders(catalog, store), cfg), storage: new MemoryStorage(), google }); });

const post = (url: string, payload: unknown, token?: string) =>
  app.inject({ method: "POST", url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (url: string, token?: string) => app.inject({ method: "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {} });
const reg = (email = "ali@example.com") => post("/v1/auth/register", { fullName: "Ali Khan", email, password: "correct-horse-1" });

async function makeStaff(role: "staff" | "owner", email = `${role}@talha.test`) {
  await store.createUser({ email, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: "Staff", phone: null, role });
  return (await post("/v1/admin/auth/login", { email, password: "staff-password-1" })).json().accessToken as string;
}

describe("customer auth", () => {
  it("registers, never returns the password hash, and rejects duplicates", async () => {
    const r = await reg();
    expect(r.statusCode).toBe(201);
    expect(r.json().user.email).toBe("ali@example.com");
    expect(JSON.stringify(r.json())).not.toMatch(/passwordHash|argon2/);
    expect((await reg()).statusCode).toBe(409);
  });
  it("validates input with field errors", async () => {
    const r = await post("/v1/auth/register", { fullName: "A", email: "nope", password: "short" });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().error.fields)).toEqual(expect.arrayContaining(["fullName", "email", "password"]));
  });
  it("logs in with correct password only", async () => {
    await reg();
    expect((await post("/v1/auth/login", { email: "ali@example.com", password: "wrong-password" })).statusCode).toBe(401);
    expect((await post("/v1/auth/login", { email: "ghost@example.com", password: "whatever-1" })).statusCode).toBe(401);
    const ok = await post("/v1/auth/login", { email: "ALI@example.com", password: "correct-horse-1" });
    expect(ok.statusCode).toBe(200);
    expect((await get("/v1/me", ok.json().accessToken)).json().user.email).toBe("ali@example.com");
  });
  it("requires a token for /me", async () => {
    expect((await get("/v1/me")).statusCode).toBe(401);
    expect((await get("/v1/me", "garbage")).statusCode).toBe(401);
  });
  it("rotates refresh tokens and revokes all sessions on reuse", async () => {
    const first = (await reg()).json();
    const second = await post("/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(second.statusCode).toBe(200);
    const replay = await post("/v1/auth/refresh", { refreshToken: first.refreshToken });
    expect(replay.statusCode).toBe(401);
    // the legitimately rotated token is now dead too (theft response)
    expect((await post("/v1/auth/refresh", { refreshToken: second.json().refreshToken })).statusCode).toBe(401);
  });
  it("logout revokes the refresh token", async () => {
    const t = (await reg()).json();
    expect((await post("/v1/auth/logout", { refreshToken: t.refreshToken })).statusCode).toBe(204);
    expect((await post("/v1/auth/refresh", { refreshToken: t.refreshToken })).statusCode).toBe(401);
  });
  it("rate limits repeated login attempts", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post("/v1/auth/login", { email: "a@b.com", password: "bad-password" })).statusCode);
    expect(codes).toContain(429);
  });
});

describe("google sign-in", () => {
  it("creates an account from a verified token and reuses it", async () => {
    const a = await post("/v1/auth/google", { idToken: "good-token-xxxxxxxxxxxxxxxx" });
    expect(a.statusCode).toBe(200);
    expect(a.json().user.email).toBe("gina@example.com");
    await post("/v1/auth/google", { idToken: "good-token-yyyyyyyyyyyyyyyy" });
    expect(store.users.size).toBe(1);
  });
  it("rejects invalid or unverified tokens", async () => {
    expect((await post("/v1/auth/google", { idToken: "bad-token-xxxxxxxxxxxxxxxxx" })).statusCode).toBe(401);
    expect((await post("/v1/auth/google", { idToken: "unverified-xxxxxxxxxxxxxxxx" })).statusCode).toBe(401);
  });
});

describe("addresses and account deletion", () => {
  it("manages only the caller's own addresses", async () => {
    const a = (await reg("a@example.com")).json().accessToken;
    const b = (await reg("b@example.com")).json().accessToken;
    const addr = { recipient: "Ali Khan", phone: "+92 300 1234567", line1: "House 123, Street 1", city: "Lahore", isDefault: true };
    const created = await post("/v1/me/addresses", addr, a);
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await app.inject({ method: "DELETE", url: `/v1/me/addresses/${id}`, headers: { authorization: `Bearer ${b}` } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/v1/me/addresses/${id}`, headers: { authorization: `Bearer ${a}` } })).statusCode).toBe(204);
  });
  it("deletes (anonymises) an account after password confirmation", async () => {
    const t = (await reg()).json();
    const bad = await app.inject({ method: "DELETE", url: "/v1/me", payload: { password: "nope-nope-nope" }, headers: { authorization: `Bearer ${t.accessToken}` } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/v1/me/delete", payload: { password: "correct-horse-1" }, headers: { authorization: `Bearer ${t.accessToken}` } });
    expect(ok.statusCode).toBe(204);
    expect((await get("/v1/me", t.accessToken)).statusCode).toBe(401);
    expect((await post("/v1/auth/refresh", { refreshToken: t.refreshToken })).statusCode).toBe(401);
    expect([...store.users.values()][0]!.email).toMatch(/deleted\.invalid$/);
  });
});

describe("admin separation and RBAC", () => {
  it("customers cannot use the admin login; staff cannot use the customer login", async () => {
    await reg();
    expect((await post("/v1/admin/auth/login", { email: "ali@example.com", password: "correct-horse-1" })).statusCode).toBe(401);
    await makeStaff("staff");
    expect((await post("/v1/auth/login", { email: "staff@talha.test", password: "staff-password-1" })).statusCode).toBe(403);
  });
  it("a customer token is rejected on admin routes, and an admin token on customer routes", async () => {
    const cust = (await reg()).json().accessToken;
    const adm = await makeStaff("staff");
    expect((await get("/v1/admin/me", cust)).statusCode).toBe(401);
    expect((await get("/v1/me", adm)).statusCode).toBe(401);
    expect((await get("/v1/admin/me", adm)).statusCode).toBe(200);
  });
  it("only the owner can manage team accounts; changes are logged", async () => {
    const staff = await makeStaff("staff");
    const owner = await makeStaff("owner");
    const body = { fullName: "New Admin", email: "new@talha.test", password: "long-password-123", role: "admin" };
    expect((await post("/v1/admin/users", body, staff)).statusCode).toBe(403);
    expect((await get("/v1/admin/users", staff)).statusCode).toBe(403);
    expect((await post("/v1/admin/users", body, owner)).statusCode).toBe(201);
    expect(store.activity.some((a: any) => a.action === "user.create")).toBe(true);
    // role cannot be escalated to owner through the API
    expect((await post("/v1/admin/users", { ...body, email: "x@talha.test", role: "owner" }, owner)).statusCode).toBe(400);
  });
  it("deactivated staff lose access immediately", async () => {
    const owner = await makeStaff("owner");
    const staffToken = await makeStaff("staff", "s2@talha.test");
    const staffUser = await store.findUserByEmail("s2@talha.test");
    const r = await app.inject({ method: "PATCH", url: `/v1/admin/users/${staffUser!.id}`, payload: { isActive: false }, headers: { authorization: `Bearer ${owner}` } });
    expect(r.statusCode).toBe(200);
    expect((await get("/v1/admin/me", staffToken)).statusCode).toBe(401);
  });
});

describe("misc", () => {
  it("healthz works and unknown routes return a JSON 404", async () => {
    expect((await get("/healthz")).json()).toEqual({ ok: true });
    expect((await get("/nope")).json().error.code).toBe("NOT_FOUND");
  });
});
