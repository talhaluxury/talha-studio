import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { composeEvents } from "../src/events.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { FcmSender, MemorySender, NullSender, PushError, type PushSender } from "../src/pushSender.js";
import { hashPassword } from "../src/security.js";
import { MemoryStorage } from "../src/storage.js";
import { emailCfgFields, emailDeps } from "./helpers.js";

const cfg: Config = {
  NODE_ENV: "test", ...emailCfgFields, FCM_SERVICE_ACCOUNT_JSON: "", PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
} as Config;
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };
const T1 = "tokenAAAAAAAAAAAAAAAAAAAA1", T2 = "tokenBBBBBBBBBBBBBBBBBBBB2";

let app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStore, catalog: MemoryCatalog, sender: MemorySender;
let deps: ReturnType<typeof emailDeps>;
let admin: string, staff: string, alice: string, bob: string; let aliceId: string, bobId: string;

async function build(s: PushSender) {
  store = new MemoryStore(); catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store);
  deps = emailDeps(orders, cfg, undefined, undefined, store, s);
  return buildApp(cfg, { store, catalog, orders, storage: new MemoryStorage(), images, ...deps });
}
async function mk(role: "admin" | "staff") {
  await store.createUser({ email: `${role}@t.test`, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: role, phone: null, role });
  return (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: `${role}@t.test`, password: "staff-password-1" } })).json().accessToken as string;
}
async function reg(email: string) {
  const r = (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Test User", email, password: "correct-horse-1" } })).json();
  return { token: r.accessToken as string, id: r.user.id as string };
}
async function boot(s: PushSender) {
  app = await build(s); admin = await mk("admin"); staff = await mk("staff");
  ({ token: alice, id: aliceId } = await reg("alice@t.test")); ({ token: bob, id: bobId } = await reg("bob@t.test"));
}
beforeEach(async () => { sender = new MemorySender(); await boot(sender); });

const call = (method: any, url: string, token?: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
let n = 0;
async function placeOrder(token = alice) {
  const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
  const sku = `P${++n}`;
  const p = (await call("POST", "/v1/admin/products", admin, { sku, name: "Lawn Suit", categoryId: cat.id, price: 5000, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock: 50 }] })).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 });
  await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
  const r = await app.inject({ method: "POST", url: "/v1/orders", headers: { authorization: `Bearer ${token}`, "idempotency-key": `key-${n}-abcdefgh` },
    payload: { items: [{ variantId: p.variants[0].id, qty: 1 }], customer: { name: "Ali Khan", email: "ali@example.com", phone: "+92 300 1234567" }, address: { line1: "House 1, Street 2", city: "Lahore" }, paymentMethod: "cod" } });
  expect(r.statusCode).toBe(201); return r.json();
}
const settle = async () => { await new Promise((r) => setTimeout(r, 10)); await deps.push.idle(); };

describe("device tokens", () => {
  it("registers, refreshes without duplicating, and reassigns a phone that switched accounts", async () => {
    expect((await call("POST", "/v1/me/devices", alice, { fcmToken: T1 })).statusCode).toBe(204);
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 });
    expect(await deps.pushStore.tokensForUser(aliceId)).toEqual([T1]);
    await call("POST", "/v1/me/devices", bob, { fcmToken: T1 });                                  // same phone, different account
    expect(await deps.pushStore.tokensForUser(aliceId)).toEqual([]); expect(await deps.pushStore.tokensForUser(bobId)).toEqual([T1]);
  });
  it("validates, requires auth, caps devices per user and unregisters by body (token never in the URL)", async () => {
    expect((await call("POST", "/v1/me/devices", undefined, { fcmToken: T1 })).statusCode).toBe(401);
    expect((await call("POST", "/v1/me/devices", alice, { fcmToken: "short" })).statusCode).toBe(400);
    for (let i = 0; i < 7; i++) await call("POST", "/v1/me/devices", alice, { fcmToken: `tok-${i}-`.padEnd(30, "x") });
    expect((await deps.pushStore.tokensForUser(aliceId)).length).toBe(5);
    const t = (await deps.pushStore.tokensForUser(aliceId))[0]!;
    expect((await call("POST", "/v1/me/devices/unregister", alice, { fcmToken: t })).statusCode).toBe(204);
    expect(await deps.pushStore.tokensForUser(aliceId)).not.toContain(t);
    await call("POST", "/v1/me/devices/unregister", bob, { fcmToken: (await deps.pushStore.tokensForUser(aliceId))[0] });   // someone else's token: no effect
    expect((await deps.pushStore.tokensForUser(aliceId)).length).toBe(4);
  });
});

describe("order notifications", () => {
  it("creates an inbox entry and pushes to the customer's devices with a deep link", async () => {
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 }); await call("POST", "/v1/me/devices", alice, { fcmToken: T2 });
    const o = await placeOrder(); await settle();
    expect(sender.sent.map((s) => s.token).sort()).toEqual([T1, T2]);
    const m = sender.sent[0]!.m; expect(m).toMatchObject({ title: "Order confirmed", kind: "order", deepLink: `talhastudio://order/${o.id}` }); expect(m.body).toContain(o.orderNumber);
    const inbox = (await call("GET", "/v1/me/notifications", alice)).json();
    expect(inbox.total).toBe(1); expect(inbox.unread).toBe(1); expect(inbox.items[0]).toMatchObject({ kind: "order", read: false, deepLink: `talhastudio://order/${o.id}` });
    expect((await call("GET", "/v1/me/notifications", bob)).json().total).toBe(0);
  });
  it("pushes for shipped, delivered and cancelled but stays quiet for intermediate steps", async () => {
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 }); const o = await placeOrder(); await settle(); sender.sent.length = 0;
    const patch = (status: string) => call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status });
    await patch("confirmed"); await patch("processing"); await settle(); expect(sender.sent).toHaveLength(0);
    await patch("shipped"); await settle(); expect(sender.sent.at(-1)!.m.title).toBe("Your order is on its way");
    await patch("delivered"); await settle(); expect(sender.sent.at(-1)!.m.title).toBe("Order delivered");
    const o2 = await placeOrder(); await settle(); sender.sent.length = 0;
    await call("POST", `/v1/me/orders/${o2.id}/cancel`, alice); await settle(); expect(sender.sent.at(-1)!.m.title).toBe("Order cancelled");
  });
  it("respects the order-updates preference (inbox still records it)", async () => {
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 });
    expect((await call("PATCH", "/v1/me/notification-preferences", alice, { orderUpdates: false })).json()).toEqual({ orderUpdates: false, promotions: true });
    await placeOrder(); await settle();
    expect(sender.sent).toHaveLength(0); expect((await call("GET", "/v1/me/notifications", alice)).json().total).toBe(1);
    expect((await call("PATCH", "/v1/me/notification-preferences", alice, {})).statusCode).toBe(400);
  });
  it("deletes dead tokens reported by FCM, keeps tokens on temporary errors, and never fails the order", async () => {
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 }); await call("POST", "/v1/me/devices", alice, { fcmToken: T2 });
    sender.failures.set(T1, new PushError("UNREGISTERED", true, false));
    await placeOrder(); await settle();
    expect(await deps.pushStore.tokensForUser(aliceId)).toEqual([T2]); expect(sender.sent.map((s) => s.token)).toEqual([T2]);
    sender.failures.clear(); sender.failures.set(T2, new PushError("FCM 503", false, true));
    const o = await placeOrder(); await settle();
    expect(await deps.pushStore.tokensForUser(aliceId)).toEqual([T2]); expect(o.status).toBe("pending");
  });
  it("still fills the in-app inbox when push is not configured", async () => {
    await boot(new NullSender());
    await call("POST", "/v1/me/devices", alice, { fcmToken: T1 });
    const o = await placeOrder(); await settle(); expect(o.orderNumber).toMatch(/^TS-/);
    expect((await call("GET", "/v1/me/notifications", alice)).json().total).toBe(1);
  });
  it("composeEvents isolates failures between handlers", async () => {
    const calls: string[] = [];
    const ev = composeEvents({ orderPlaced: async () => { throw new Error("boom"); }, statusChanged: async () => {} }, { orderPlaced: async () => { calls.push("ok"); }, statusChanged: async () => {} });
    await ev.orderPlaced({} as any); expect(calls).toEqual(["ok"]);
  });
});

describe("inbox", () => {
  it("lists, marks read, marks all read, and never exposes another customer's notifications", async () => {
    await placeOrder(); await placeOrder(); await settle();
    const list = (await call("GET", "/v1/me/notifications", alice)).json(); expect(list.unread).toBe(2);
    const id = list.items[0].id;
    expect((await call("POST", `/v1/me/notifications/${id}/read`, bob)).statusCode).toBe(404);
    expect((await call("POST", `/v1/me/notifications/${id}/read`, alice)).statusCode).toBe(204);
    expect((await call("GET", "/v1/me/notifications/unread-count", alice)).json()).toEqual({ unread: 1 });
    expect((await call("POST", "/v1/me/notifications/read-all", alice)).json()).toEqual({ updated: 1 });
    expect((await call("POST", "/v1/me/notifications/not-a-uuid/read", alice)).statusCode).toBe(400);
    expect((await call("GET", "/v1/me/notifications")).statusCode).toBe(401);
  });
});

describe("admin campaigns", () => {
  const send = (token: string | undefined, body: object) => call("POST", "/v1/admin/campaigns", token, body);
  beforeEach(async () => { await call("POST", "/v1/me/devices", alice, { fcmToken: T1 }); await call("POST", "/v1/me/devices", bob, { fcmToken: T2 }); });

  it("is admin/owner only", async () => {
    const b = { title: "Eid Sale", body: "Up to 50% off" };
    expect((await send(staff, b)).statusCode).toBe(403); expect((await send(alice, b)).statusCode).toBe(401); expect((await send(undefined, b)).statusCode).toBe(401);
    expect(sender.sent).toHaveLength(0);
  });
  it("sends to every opted-in customer, skips opted-out ones, and records the result", async () => {
    await call("PATCH", "/v1/me/notification-preferences", bob, { promotions: false });
    const r = await send(admin, { title: "Eid Sale", body: "Up to 50% off selected items" }); await settle();
    expect(r.statusCode).toBe(202); expect(r.json()).toMatchObject({ recipients: 1, devices: 1, pushConfigured: true });
    expect(sender.sent.map((x) => x.token)).toEqual([T1]); expect(sender.sent[0]!.m).toMatchObject({ kind: "promo", title: "Eid Sale" });
    expect((await call("GET", "/v1/me/notifications", alice)).json().items[0]).toMatchObject({ kind: "promo", title: "Eid Sale" });
    expect((await call("GET", "/v1/me/notifications", bob)).json().total).toBe(0);
    const list = (await call("GET", "/v1/admin/campaigns", admin)).json();
    expect(list.items[0]).toMatchObject({ title: "Eid Sale", recipients: 1, failed: 0 }); expect(list.items[0].sentAt).toBeTruthy();
    expect(list.audience).toEqual({ users: 1, devices: 1 }); expect(list.pushConfigured).toBe(true);
    expect(store.activity.some((a: any) => a.action === "campaign.send")).toBe(true);
  });
  it("counts failed deliveries and removes dead tokens", async () => {
    sender.failures.set(T1, new PushError("UNREGISTERED", true, false)); sender.failures.set(T2, new PushError("FCM 503", false, true));
    await send(admin, { title: "New arrivals", body: "Fresh styles are in" }); await settle();
    const c = (await call("GET", "/v1/admin/campaigns", admin)).json().items[0];
    expect(c).toMatchObject({ recipients: 2, failed: 2 });
    expect(await deps.pushStore.tokensForUser(aliceId)).toEqual([]); expect(await deps.pushStore.tokensForUser(bobId)).toEqual([T2]);
  });
  it("blocks accidental double-sends and validates content and deep links", async () => {
    const b = { title: "Flash sale", body: "Tonight only" };
    expect((await send(admin, b)).statusCode).toBe(202); expect((await send(admin, b)).statusCode).toBe(409);
    const id = "11111111-1111-4111-8111-111111111111";
    expect((await send(admin, { title: "Link", body: "Product", deepLink: `talhastudio://product/${id}` })).statusCode).toBe(202);
    expect((await send(admin, { title: "Bad", body: "Link", deepLink: "https://evil.example.com" })).statusCode).toBe(400);   // note: the route allows 5 sends per minute
    expect((await send(admin, { title: "x".repeat(66), body: "ok body" })).statusCode).toBe(400);
  });
  it("without FCM configured, campaigns still reach the in-app inbox and the admin is told", async () => {
    await boot(new NullSender());
    const r = await send(admin, { title: "Eid Sale", body: "Up to 50% off" }); await settle();
    expect(r.statusCode).toBe(202); expect(r.json()).toMatchObject({ recipients: 2, pushConfigured: false });
    expect((await call("GET", "/v1/me/notifications", alice)).json().total).toBe(1);
  });
});

describe("FCM HTTP v1 sender (no network: fetch is injected)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const sa = { project_id: "talha-proj", client_email: "svc@talha-proj.iam.gserviceaccount.com", private_key: privateKey };
  const msg = { title: "Order shipped", body: "TS-100245 is on its way", deepLink: "talhastudio://order/abc", kind: "order" as const, notificationId: "n1" };
  type Call = { url: string; init: RequestInit };
  function fake(sendStatus: () => { status: number; body?: object }) {
    const calls: Call[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3600 }), { status: 200 });
      const r = sendStatus(); return new Response(JSON.stringify(r.body ?? { name: "projects/x/messages/1" }), { status: r.status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  it("signs a valid service-account JWT, caches the access token, and posts the message in FCM v1 shape", async () => {
    const { f, calls } = fake(() => ({ status: 200 })); const s = new FcmSender(sa, f, () => 1_800_000_000_000);
    await s.send("device-token-1", msg); await s.send("device-token-2", msg);
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(1);
    const assertion = new URLSearchParams(String(calls[0]!.init.body)).get("assertion")!;
    const claims = jwt.verify(assertion, publicKey, { algorithms: ["RS256"], clockTimestamp: 1_800_000_000 }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token" });
    const send = calls[1]!; expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/talha-proj/messages:send");
    expect((send.init.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
    expect(JSON.parse(String(send.init.body)).message).toEqual({ token: "device-token-1", notification: { title: msg.title, body: msg.body },
      data: { kind: "order", deepLink: msg.deepLink, notificationId: "n1" }, android: { priority: "HIGH", notification: { channel_id: "orders" } } });
  });
  it("uses the promotions channel for campaigns and refreshes an expired access token once", async () => {
    let first = true; const { f, calls } = fake(() => (first ? ((first = false), { status: 401, body: { error: { status: "UNAUTHENTICATED", message: "expired" } } }) : { status: 200 }));
    await new FcmSender(sa, f).send("t".repeat(30), { ...msg, kind: "promo" });
    expect(calls.filter((c) => c.url.includes("oauth2"))).toHaveLength(2);
    expect(JSON.parse(String(calls.at(-1)!.init.body)).message.android.notification.channel_id).toBe("promotions");
  });
  it("classifies errors: dead token vs temporary vs request problems", async () => {
    const run = async (status: number, error: object) => { try { await new FcmSender(sa, fake(() => ({ status, body: { error } })).f).send("x".repeat(30), msg); return null; } catch (e) { return e as PushError; } };
    expect(await run(404, { status: "NOT_FOUND", message: "x", details: [{ errorCode: "UNREGISTERED" }] })).toMatchObject({ invalidToken: true });
    expect(await run(400, { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" })).toMatchObject({ invalidToken: true });
    expect(await run(429, { status: "QUOTA_EXCEEDED", message: "slow" })).toMatchObject({ invalidToken: false, transient: true });
    expect(await run(503, { status: "UNAVAILABLE", message: "down" })).toMatchObject({ transient: true });
    expect(await run(400, { status: "INVALID_ARGUMENT", message: "Invalid JSON payload" })).toMatchObject({ invalidToken: false, transient: false });
  });
});
