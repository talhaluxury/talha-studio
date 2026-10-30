import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { EmailError, MemoryEmailProvider, NullProvider, ResendProvider } from "../src/emailProvider.js";
import { EmailService } from "../src/emailService.js";
import { renderOrderConfirmation, renderOwnerNewOrder } from "../src/emailTemplates.js";
import type { ImageProcessor } from "../src/images.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryEmailStore } from "../src/memoryEmail.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { hashPassword } from "../src/security.js";
import { DEFAULT_SETTINGS, MemorySettings } from "../src/settingsStore.js";
import { MemoryStorage } from "../src/storage.js";
import { MemoryPushStore } from "../src/memoryPush.js";
import { PushService } from "../src/pushService.js";
import { MemoryBanners } from "../src/memoryBanners.js";
import { MemoryChat } from "../src/memoryChat.js";
import { MemorySlides, MemoryStatus } from "../src/memoryContent.js";
import { MemoryCoupons } from "../src/memoryCoupons.js";
import { NullSender } from "../src/pushSender.js";
import { verifySvix } from "../src/webhooks.js";

const SECRET_RAW = "secretsecretsecretsecret"; const WH = "whsec_" + Buffer.from(SECRET_RAW).toString("base64");
const cfg: Config = {
  NODE_ENV: "test", EMAIL_DRIVER: "resend", EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: WH, SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "",
  CRON_SECRET: "cron-secret-123456", ADMIN_PUBLIC_URL: "https://admin.talha.test", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio",
  PORT: 0, DATABASE_URL: "x", JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "",
  MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 0,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
};
const images: ImageProcessor = { process: async () => ({ full: Buffer.from("f"), thumb: Buffer.from("t"), width: 1, height: 1 }) };

let clock: Date;
let app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStore, catalog: MemoryCatalog, orders: MemoryOrders;
let emails: MemoryEmailStore, settings: MemorySettings, provider: MemoryEmailProvider, svc: EmailService;
let owner: string, admin: string, staff: string, alice: string;

async function mk(role: "owner" | "admin" | "staff") {
  await store.createUser({ email: `${role}@t.test`, passwordHash: await hashPassword("staff-password-1"), googleSub: null, fullName: role, phone: null, role });
  return (await app.inject({ method: "POST", url: "/v1/admin/auth/login", payload: { email: `${role}@t.test`, password: "staff-password-1" } })).json().accessToken as string;
}
function setup(p: MemoryEmailProvider | NullProvider = new MemoryEmailProvider(), c: Config = cfg) {
  store = new MemoryStore(); catalog = new MemoryCatalog(); orders = new MemoryOrders(catalog, store); emails = new MemoryEmailStore(); settings = new MemorySettings();
  clock = new Date("2026-10-25T10:00:00Z"); emails.now = () => clock;
  provider = p as MemoryEmailProvider;
  svc = new EmailService({ cfg: c, provider: p, emails, settings, orders, now: () => clock });
  const pushStore = new MemoryPushStore(store);
  return buildApp(c, { store, catalog, orders, storage: new MemoryStorage(), images, emails, settings, email: svc, push: new PushService({ store: pushStore, sender: new NullSender() }), pushStore, coupons: new MemoryCoupons(), banners: new MemoryBanners(), chat: new MemoryChat(), slides: new MemorySlides(), status: new MemoryStatus() });
}
beforeEach(async () => {
  app = await setup();
  owner = await mk("owner"); admin = await mk("admin"); staff = await mk("staff");
  alice = (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Alice Khan", email: "alice@t.test", password: "correct-horse-1" } })).json().accessToken;
  await settings.save({ ...DEFAULT_SETTINGS, ownerEmail: "owner-shop@t.test", store: { ...DEFAULT_SETTINGS.store, supportEmail: "help@t.test", supportPhone: "+92 300 0000000" } });
});

const call = (method: any, url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as any, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
let n = 0;
async function order(name = "Alice Khan") {
  const cat = (await catalog.listCategories(false))[0] ?? (await catalog.createCategory({ name: "Women", slug: "women", parentId: null, sortOrder: 0, isActive: true }));
  const sku = `S${++n}`;
  const p = (await call("POST", "/v1/admin/products", admin, { sku, name: "Lawn Suit", categoryId: cat.id, price: 5000, salePrice: 4000, variants: [{ sku: `${sku}-M`, size: "M", color: "Black", stock: 20 }] })).json();
  await catalog.addImage(p.id, { storageKey: `products/${p.id}/a.webp`, thumbKey: `products/${p.id}/a-t.webp`, width: 1, height: 1 });
  await call("PATCH", `/v1/admin/products/${p.id}/publish`, admin, { isPublished: true });
  const r = await call("POST", "/v1/orders", alice, { items: [{ variantId: p.variants[0].id, qty: 2 }], customer: { name, email: "alice@t.test", phone: "+92 300 1234567" },
    address: { line1: "House 1, Street 2", city: "Lahore" }, notes: "Ring twice", paymentMethod: "cod" }, { "idempotency-key": `key-${n}-abcdefgh` });
  expect(r.statusCode).toBe(201); return r.json();
}
/** The order endpoint kicks off a background send; wait for the queue to settle. */
async function settle() { for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 5)); if (!emails.rows.some((r) => r.status === "queued" && r.nextAttemptAt <= clock)) break; } }

describe("order emails", () => {
  it("sends a branded confirmation to the customer and a new-order email to the owner", async () => {
    const o = await order(); await settle();
    expect(provider.sent).toHaveLength(2);
    const cust = provider.sent.find((m) => m.to === "alice@t.test")!, own = provider.sent.find((m) => m.to === "owner-shop@t.test")!;
    expect(cust.subject).toBe(`Your Talha Studio order ${o.orderNumber}`);
    expect(cust.html).toContain("TALHA"); expect(cust.html).toContain("Lawn Suit"); expect(cust.html).toContain("Rs. 8,299"); expect(cust.text).toContain("Total: Rs. 8,299");
    expect(cust.html).toContain("help@t.test"); expect(cust.html).not.toContain("ESTIMATED DELIVERY");
    expect(cust.from).toBe("Talha Studio <orders@talha.test>"); expect(cust.replyTo).toBe("help@t.test");
    expect(own.subject).toContain(o.orderNumber); expect(own.html).toContain("+92 300 1234567"); expect(own.html).toContain("Ring twice");
    expect(own.html).toContain(`https://admin.talha.test/#/orders/${o.id}`); expect(own.html).toContain("Cash on Delivery");
    expect(emails.rows.every((r) => r.status === "sent" && r.providerState === "accepted")).toBe(true);
  });
  it("shows estimated delivery only when the owner configured it", async () => {
    await settings.save({ ...(await settings.load()), estimatedDelivery: "3-5 working days" });
    await order(); await settle();
    expect(provider.sent.find((m) => m.to === "alice@t.test")!.html).toContain("3-5 working days");
  });
  it("never sends the same email twice (dedupe key + replayed order)", async () => {
    const o = await order(); await settle();
    const full = (await orders.adminGet(o.id))!;
    await svc.orderPlaced(full); await svc.orderPlaced(full); await settle();
    expect(emails.rows).toHaveLength(2); expect(provider.sent).toHaveLength(2);
    // replaying the same checkout request does not create a second order or email either
    const again = await call("POST", "/v1/orders", alice, { items: [{ variantId: o.items[0].variantId, qty: 2 }], customer: { name: "Alice Khan", email: "alice@t.test", phone: "+92 300 1234567" }, address: { line1: "House 1, Street 2", city: "Lahore" }, paymentMethod: "cod" }, { "idempotency-key": `key-${n}-abcdefgh` });
    expect(again.statusCode).toBe(200); await settle(); expect(emails.rows).toHaveLength(2);
  });
  it("escapes customer-supplied text in HTML and strips newlines from subjects", () => {
    const o: any = { id: "1", orderNumber: "TS-1", customer: { name: "<script>alert(1)</script>\nBcc: evil@x.com", email: "a@b.co", phone: "1" }, address: { line1: "<img src=x onerror=1>", line2: null, city: "L", province: null, postalCode: null },
      items: [{ name: "<b>Suit</b>", sku: "S", size: null, color: null, unitPrice: 100, qty: 1 }], subtotal: 100, discount: 0, shipping: 0, total: 100, status: "pending", paymentMethod: "cod", paymentStatus: "unpaid", notes: "<i>hi</i>", trackingUrl: null, createdAt: new Date(), history: [] };
    const s = { ...DEFAULT_SETTINGS, templates: { ...DEFAULT_SETTINGS.templates, order_confirmation: { ...DEFAULT_SETTINGS.templates.order_confirmation, subject: "Order {{orderNumber}} for {{customerName}}" } } };
    const r = renderOrderConfirmation(o, s, { storeName: "T", logoUrl: "", adminUrl: "", timezone: "UTC" });
    expect(r.html).not.toContain("<script>"); expect(r.html).not.toContain("<img src=x"); expect(r.html).toContain("&lt;script&gt;");
    expect(r.subject).not.toMatch(/[\r\n]/);
    expect(renderOwnerNewOrder(o, s, { storeName: "T", logoUrl: "", adminUrl: "", timezone: "UTC" }).html).not.toContain("<i>hi</i>");
  });
  it("includes the tracking link in the shipped email, and only emails the customer for key statuses", async () => {
    const o = await order(); await settle(); provider.sent.length = 0;
    const patch = (status: string, extra: object = {}) => call("PATCH", `/v1/admin/orders/${o.id}/status`, staff, { status, ...extra });
    await patch("confirmed"); await patch("processing"); await settle(); expect(provider.sent).toHaveLength(0);
    await patch("shipped", { trackingUrl: "https://track.example.com/XYZ" }); await settle();
    expect(provider.sent).toHaveLength(1); expect(provider.sent[0]!.to).toBe("alice@t.test");
    expect(provider.sent[0]!.html).toContain("https://track.example.com/XYZ"); expect(provider.sent[0]!.subject).toContain("Shipped");
    await patch("delivered"); await settle(); expect(provider.sent).toHaveLength(2);
  });
  it("alerts the owner when a customer cancels", async () => {
    const o = await order(); await settle(); provider.sent.length = 0;
    await call("POST", `/v1/me/orders/${o.id}/cancel`, alice); await settle();
    expect(provider.sent.map((m) => m.to).sort()).toEqual(["alice@t.test", "owner-shop@t.test"]);
    expect(provider.sent.find((m) => m.to === "owner-shop@t.test")!.subject).toContain("Order cancelled");
  });
});

describe("failure handling", () => {
  it("keeps the order, retries with backoff, and succeeds when the provider recovers", async () => {
    provider.failWith = new EmailError("Resend 503: temporarily unavailable", false);
    const o = await order(); await settle();
    expect((await call("GET", `/v1/me/orders/${o.id}`, alice)).statusCode).toBe(200);              // order is safe
    let row = emails.rows.find((r) => r.kind === "order_confirmation")!;
    expect(row.status).toBe("queued"); expect(row.attempts).toBe(1); expect(row.lastError).toContain("503"); expect(row.nextAttemptAt.getTime()).toBeGreaterThan(clock.getTime());
    expect(provider.sent).toHaveLength(0);
    provider.failWith = null; clock = new Date(clock.getTime() + 2 * 60_000);                        // past the 1-minute backoff
    const r = await svc.processDue(); expect(r.sent).toBe(2);
    row = emails.rows.find((x) => x.kind === "order_confirmation")!; expect(row.status).toBe("sent"); expect(row.attempts).toBe(2);
  });
  it("gives up after the maximum attempts and exposes the error", async () => {
    provider.failWith = new EmailError("network down", false); await order(); await settle();
    for (let i = 0; i < 8; i++) { clock = new Date(clock.getTime() + 7 * 3600_000); await svc.processDue(); }
    const rows = emails.rows; expect(rows.every((x) => x.status === "failed" && x.attempts === 6)).toBe(true);
  });
  it("fails permanent errors immediately; the admin can fix and retry", async () => {
    provider.failWith = new EmailError("Resend 422: invalid `to` address", true); const o = await order(); await settle();
    const row = emails.rows.find((r) => r.kind === "order_confirmation")!; expect(row.status).toBe("failed"); expect(row.attempts).toBe(1);
    expect((await call("POST", `/v1/admin/email-logs/${row.id}/retry`, staff)).statusCode).toBe(403);
    provider.failWith = null;
    expect((await call("POST", `/v1/admin/email-logs/${row.id}/retry`, admin)).json().retried).toBe(true); await settle();
    expect(emails.rows.find((r) => r.id === row.id)!.status).toBe("sent"); expect(o.status).toBe("pending");
  });
  it("records a clear failure when the owner email is missing, and recovers after it is set", async () => {
    await settings.save({ ...(await settings.load()), ownerEmail: "" });
    await order(); await settle();
    const ownerRow = emails.rows.find((r) => r.kind === "owner_new_order")!;
    expect(ownerRow.status).toBe("failed"); expect(ownerRow.lastError).toContain("Owner email");
    expect(provider.sent.map((m) => m.to)).toEqual(["alice@t.test"]);                              // customer email still went out
    const put = await call("PUT", "/v1/admin/settings", owner, { ...(await settings.load()), ownerEmail: "boss@t.test" });
    expect(put.statusCode).toBe(200);
    await call("POST", `/v1/admin/email-logs/${ownerRow.id}/retry`, admin); await settle();
    expect(provider.sent.map((m) => m.to)).toContain("boss@t.test");
  });
  it("without a configured provider emails wait in the queue and nothing is claimed", async () => {
    app = await setup(new NullProvider()); owner = await mk("owner"); admin = await mk("admin"); staff = await mk("staff");
    alice = (await app.inject({ method: "POST", url: "/v1/auth/register", payload: { fullName: "Alice Khan", email: "alice@t.test", password: "correct-horse-1" } })).json().accessToken;
    await settings.save({ ...DEFAULT_SETTINGS, ownerEmail: "o@t.test" });
    await order(); await settle();
    expect(emails.rows.map((r) => [r.status, r.attempts])).toEqual([["queued", 0], ["queued", 0]]);
    expect((await svc.processDue()).skipped).toBe(true);
    const logs = (await call("GET", "/v1/admin/email-logs", admin)).json();
    expect(logs.email.configured).toBe(false); expect(logs.email.queued).toBe(2);
  });
});

describe("settings, logs and operations", () => {
  it("only the owner can read or change settings, with validation", async () => {
    expect((await call("GET", "/v1/admin/settings", admin)).statusCode).toBe(403);
    expect((await call("GET", "/v1/admin/settings", staff)).statusCode).toBe(403);
    const cur = (await call("GET", "/v1/admin/settings", owner)).json();
    expect(cur.settings.ownerEmail).toBe("owner-shop@t.test"); expect(cur.email).toMatchObject({ provider: "memory", configured: true, deliveryTracking: true });
    expect((await call("PUT", "/v1/admin/settings", owner, { ...cur.settings, ownerEmail: "not-an-email" })).statusCode).toBe(400);
    const bad = { ...cur.settings, templates: { ...cur.settings.templates, status_update: { ...cur.settings.templates.status_update, subject: "Hi\nBcc: x@y.z" } } };
    expect((await call("PUT", "/v1/admin/settings", owner, bad)).statusCode).toBe(400);
    const ok = await call("PUT", "/v1/admin/settings", owner, { ...cur.settings, estimatedDelivery: "2-4 days" });
    expect(ok.json().settings.estimatedDelivery).toBe("2-4 days");
    expect(store.activity.some((a: any) => a.action === "settings.update")).toBe(true);
  });
  it("sends a test email only to the saved owner address and reports provider errors honestly", async () => {
    expect((await call("POST", "/v1/admin/email/test", admin)).statusCode).toBe(403);
    const ok = (await call("POST", "/v1/admin/email/test", owner)).json(); expect(ok.ok).toBe(true); expect(ok.message).toContain("Acceptance is not delivery");
    expect(provider.sent.at(-1)!.to).toBe("owner-shop@t.test");
    provider.failWith = new EmailError("Resend 403: domain not verified", true);
    const bad = (await call("POST", "/v1/admin/email/test", owner)).json(); expect(bad).toEqual({ ok: false, message: "Resend 403: domain not verified" });
  });
  it("lists logs with honest delivery wording", async () => {
    await order(); await settle();
    const r = (await call("GET", "/v1/admin/email-logs?status=sent", admin)).json();
    expect(r.total).toBe(2); expect(r.items[0].delivery).toBe("accepted_by_provider");
    expect((await call("GET", "/v1/admin/email-logs", staff)).statusCode).toBe(403);
  });
  it("cron endpoint requires the secret", async () => {
    expect((await call("POST", "/v1/internal/email/run")).statusCode).toBe(401);
    expect((await call("POST", "/v1/internal/email/run", undefined, undefined, { "x-cron-secret": "wrong-secret-xxxxxx" })).statusCode).toBe(401);
    expect((await call("POST", "/v1/internal/email/run", undefined, undefined, { "x-cron-secret": cfg.CRON_SECRET })).statusCode).toBe(200);
    const off = await setup(new MemoryEmailProvider(), { ...cfg, CRON_SECRET: "" });
    expect((await off.inject({ method: "POST", url: "/v1/internal/email/run" })).statusCode).toBe(404);
  });
});

describe("delivery confirmation webhook", () => {
  const sign = (id: string, ts: string, body: string, key = SECRET_RAW) => "v1," + createHmac("sha256", Buffer.from(key)).update(`${id}.${ts}.${body}`).digest("base64");
  const hook = (body: object, over: { id?: string; ts?: string; sig?: string } = {}) => {
    const raw = JSON.stringify(body); const id = over.id ?? "msg_1"; const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
    return app.inject({ method: "POST", url: "/v1/webhooks/resend", payload: raw, headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": over.sig ?? sign(id, ts, raw) } });
  };
  it("marks an email delivered or bounced only with a valid signature", async () => {
    await order(); await settle();
    const row = emails.rows.find((r) => r.kind === "order_confirmation")!;
    const forged = await hook({ type: "email.delivered", data: { email_id: row.providerMessageId } }, { sig: "v1,AAAA" });
    expect(forged.statusCode).toBe(401); expect(emails.rows.find((r) => r.id === row.id)!.providerState).toBe("accepted");
    const stale = await hook({ type: "email.delivered", data: { email_id: row.providerMessageId } }, { ts: String(Math.floor(Date.now() / 1000) - 3600) });
    expect(stale.statusCode).toBe(401);
    expect((await hook({ type: "email.delivered", data: { email_id: row.providerMessageId } })).statusCode).toBe(200);
    expect((await call("GET", "/v1/admin/email-logs", admin)).json().items.find((i: any) => i.id === row.id).delivery).toBe("delivered");
    await hook({ type: "email.delivery_delayed", data: { email_id: row.providerMessageId } });          // must not downgrade
    expect(emails.rows.find((r) => r.id === row.id)!.providerState).toBe("delivered");
    const other = emails.rows.find((r) => r.kind === "owner_new_order")!;
    await hook({ type: "email.bounced", data: { email_id: other.providerMessageId, bounce: { message: "Mailbox full" } } });
    expect(emails.rows.find((r) => r.id === other.id)!.providerState).toBe("bounced"); expect(emails.rows.find((r) => r.id === other.id)!.lastError).toBe("Mailbox full");
  });
  it("verifySvix unit: accepts good, rejects tampered body and wrong secret", () => {
    const body = '{"a":1}', ts = String(Math.floor(Date.now() / 1000));
    const good = { secret: WH, id: "i", timestamp: ts, signature: sign("i", ts, body), body };
    expect(verifySvix(good)).toBe(true); expect(verifySvix({ ...good, body: '{"a":2}' })).toBe(false);
    expect(verifySvix({ ...good, secret: "whsec_" + Buffer.from("other-secret-other").toString("base64") })).toBe(false); expect(verifySvix({ ...good, signature: undefined })).toBe(false);
  });
});

describe("Resend provider (no network: fetch is injected)", () => {
  const msg = { to: "a@b.co", from: "T <o@t.co>", subject: "S", html: "<p>h</p>", text: "h", idempotencyKey: "order_confirmation:123" };
  const resp = (status: number, body: object) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  it("posts the right request with an idempotency key and returns the message id", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const p = new ResendProvider("re_key", (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }); }) as any);
    expect(await p.send({ ...msg, replyTo: "help@t.co" })).toEqual({ messageId: "abc-123" });
    const h = seen!.init.headers as Record<string, string>; expect(seen!.url).toBe("https://api.resend.com/emails");
    expect(h.Authorization).toBe("Bearer re_key"); expect(h["Idempotency-Key"]).toBe("order_confirmation:123");
    const b = JSON.parse(String(seen!.init.body)); expect(b).toMatchObject({ from: msg.from, to: ["a@b.co"], subject: "S", reply_to: "help@t.co" });
  });
  it("classifies errors: 4xx permanent, 429/5xx/network transient", async () => {
    const run = async (f: any) => { try { await new ResendProvider("k", f).send(msg); return null; } catch (e) { return e as EmailError; } };
    expect((await run(resp(422, { message: "invalid to" })))!.permanent).toBe(true);
    expect((await run(resp(403, { message: "domain not verified" })))!.message).toContain("domain not verified");
    expect((await run(resp(429, { message: "slow down" })))!.permanent).toBe(false);
    expect((await run(resp(500, { message: "oops" })))!.permanent).toBe(false);
    expect((await run(async () => { throw new Error("ECONNRESET"); }))!.permanent).toBe(false);
  });
});
