import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { LLM } from "../src/assistant.js";
import type { Config } from "../src/config.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { MemoryWhatsApp } from "../src/memoryWhatsapp.js";
import { MemoryStorage } from "../src/storage.js";
import { AssistantService } from "../src/assistant.js";
import { WhatsAppService, type WhatsAppProvider } from "../src/whatsapp.js";
import { emailDeps } from "./helpers.js";

const cfg = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "x", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x",
  JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 10000,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
  WHATSAPP_LANG: "en", WHATSAPP_TPL_WELCOME: "welcome_customer", WHATSAPP_TPL_ORDER: "order_confirmation", ASSISTANT_DAILY_LIMIT: 100,
  WHATSAPP_TPL_NEW_ARRIVAL: "new_arrival", WHATSAPP_VERIFY_TOKEN: "verify-me", WHATSAPP_APP_SECRET: "app-secret",
} as unknown as Config;

class FakeWa implements WhatsAppProvider {
  name = "fake"; configured = true; sent: { to: string; template: string; params: string[]; media?: unknown }[] = []; texts: { to: string; text: string }[] = []; fail = false;
  async sendTemplate(to: string, template: string, _l: string, params: string[], media?: unknown) { if (this.fail) throw new Error("template not approved"); this.sent.push({ to, template, params, ...(media ? { media } : {}) }); }
  async sendText(to: string, text: string) { if (this.fail) throw new Error("window closed"); this.texts.push({ to, text }); }
}
const ali = { id: "u-ali", fullName: "Ali Khan", phone: "0300 1234567" };

describe("WhatsApp replies and new-product messages", () => {
  let wa: FakeWa; let log: MemoryWhatsApp; let svc: WhatsAppService; let statusCalls: unknown[][]; let pending: boolean; let answer: string; let confirmed: unknown[]; let updates: unknown[][];
  beforeEach(() => {
    wa = new FakeWa(); log = new MemoryWhatsApp(); statusCalls = []; confirmed = []; updates = []; pending = true; answer = "Yes, we have it in stock.";
    const orders = {
      listForUser: async () => ({ items: [{ id: "o1", orderNumber: "TS-1001", status: pending ? "pending" : "confirmed", total: 9000, createdAt: new Date(), itemCount: 1, firstItemName: "x", firstThumbKey: null }], total: 1 }),
      adminSetStatus: async (...a: unknown[]) => { statusCalls.push(a); return { id: "o1" }; },
      getForUser: async () => ({ id: "o1", customer: { name: "Ali Khan", phone: "0300 1234567" }, address: { line1: "Old House", line2: null, city: "Lahore", province: "Punjab", postalCode: null } }),
      updateDelivery: async (...a: any[]) => { updates.push(a); return { id: "o1", address: a[2].address }; },
    } as any;
    const llm: LLM = { configured: true, complete: async () => answer };
    const assistant = new AssistantService({ cfg, llm, catalog: new MemoryCatalog(), orders });
    svc = new WhatsAppService({ cfg, provider: wa, store: log, onConfirmed: async (o) => { confirmed.push(o); }, inbound: { users: { listCustomersWithPhone: async () => [ali as any] }, orders, assistant } });
  });

  it("two steps: the first YES confirms the address, the second YES confirms the order and fires the app notification", async () => {
    await svc.handleInbound("923001234567", "Haan", "m1");
    expect(statusCalls).toHaveLength(0); expect(wa.texts[0]!.text).toContain("address");
    await svc.handleInbound("923001234567", "Haan", "m1b");
    expect(statusCalls[0]).toEqual(["o1", "confirmed", "Confirmed by the customer on WhatsApp", null, "u-ali"]);
    expect(wa.texts[1]!.text).toContain("TS-1001"); expect(confirmed).toHaveLength(1);
  });
  it("understands natural sentences, but a question is never taken as a yes", async () => {
    await svc.handleInbound("923001234567", "han ye address sahi hai", "n1");
    expect(wa.texts[0]!.text).toContain("address"); expect(statusCalls).toHaveLength(0);
    answer = "It is Rs 4,500.";
    await svc.handleInbound("923001234567", "ji price kya hai?", "n3");
    expect(wa.texts[1]!.text).toBe(answer); expect(statusCalls).toHaveLength(0);
  });
  it("wrong address: asks for the right one and a number that is active, then updates the order and asks to confirm again", async () => {
    await svc.handleInbound("923001234567", "address galat hai", "w1");
    expect(wa.texts[0]!.text).toContain("mobile number"); expect(updates).toHaveLength(0);
    answer = JSON.stringify({ line1: "House 5, Street 2", line2: "Gulberg", city: "Lahore", province: "Punjab", phone: "0321 1234567" });
    await svc.handleInbound("923001234567", "House 5 street 2 Gulberg Lahore, number 0321 1234567", "w2");
    expect(updates[0]![0]).toBe("o1"); expect(updates[0]![2]).toEqual({ address: { line1: "House 5, Street 2", line2: "Gulberg", city: "Lahore", province: "Punjab", postalCode: null }, phone: "03211234567" });
    expect(wa.texts[1]!.text).toContain("03211234567"); expect(wa.texts[1]!.text).toContain("YES");
    expect(statusCalls).toHaveLength(0);                        // still waiting for the customer to say the new details are right
  });
  it("wrong address, given in two messages: address first, then 'same' for the number", async () => {
    answer = JSON.stringify({ line1: "Flat 3, Block B", city: "Karachi", province: "Sindh" });
    await svc.handleInbound("923001234567", "address galat hai, Flat 3 Block B Karachi", "p1");
    expect(wa.texts[0]!.text).toContain("same"); expect(updates).toHaveLength(0);
    answer = JSON.stringify({ sameNumber: true });
    await svc.handleInbound("923001234567", "same", "p2");
    expect((updates[0]![2] as any).phone).toBe("03001234567"); expect((updates[0]![2] as any).address.city).toBe("Karachi");
  });
  it("in QR mode the order message carries the product photo, items, total and the delivery address", async () => {
    wa.name = "qr";
    const order = { id: "o9", orderNumber: "TS-2002", total: 9500, customer: { name: "Ali Khan", phone: "0300 1234567", email: "a@b.c" }, address: { line1: "House 5, Street 2", line2: null, city: "Lahore", province: "Punjab", postalCode: null },
      items: [{ name: "Lawn Suit", size: "M", color: null, qty: 2, thumbKey: "t/1.webp" }] } as any;
    const q = new WhatsAppService({ cfg, provider: wa, store: log, mediaUrl: (k) => `https://cdn.test/${k}` });
    await q.orderPlaced(order);
    const m = wa.sent[0]!.media as { text: string; imageUrl: string };
    expect(m.imageUrl).toBe("https://cdn.test/t/1.webp");
    for (const t of ["TS-2002", "Lawn Suit (M) x2", "Rs 9,500", "House 5, Street 2, Lahore, Punjab", "address", "0300 1234567", "call"]) expect(m.text).toContain(t);
  });
  it("YES with no pending order does not touch anything", async () => {
    pending = false; await svc.handleInbound("923001234567", "yes", "m2");
    expect(statusCalls).toHaveLength(0); expect(wa.texts[0]!.text).toContain("no order waiting");
  });
  it("answers other messages with the AI assistant, and handles each message id once", async () => {
    await svc.handleInbound("923001234567", "Black waistcoat hai?", "m3"); await svc.handleInbound("923001234567", "Black waistcoat hai?", "m3");
    expect(wa.texts).toEqual([{ to: "923001234567", text: "Yes, we have it in stock." }]);
  });
  it("caps replies per number per hour", async () => {
    for (let i = 0; i < 25; i++) await svc.handleInbound("923001234567", `q${i}`, `id${i}`);
    expect(wa.texts).toHaveLength(20);
  });
  it("never throws when sending the reply fails and records the error", async () => {
    wa.fail = true; await expect(svc.handleInbound("923001234567", "hi", "m4")).resolves.toBeUndefined();
    expect(log.rows[0]).toMatchObject({ kind: "reply", status: "failed" });
  });
  it("STOP blocks new-product messages until START", async () => {
    await svc.handleInbound("923001234567", "STOP", "m5");
    const p = { id: "p1", name: "Black Waistcoat", price: 8000, salePrice: 6500 };
    expect(await svc.broadcastNewArrival(p, [ali])).toEqual({ total: 1, sent: 0, failed: 0, skipped: 1 });
    await svc.handleInbound("923001234567", "start", "m6");
    expect(await svc.broadcastNewArrival(p, [ali])).toEqual({ total: 1, sent: 1, failed: 0, skipped: 0 });
    expect(wa.sent[0]).toEqual({ to: "923001234567", template: "new_arrival", params: ["Ali", "Black Waistcoat", "6,500", "Talha Studio"] });
  });
  it("tells each customer about a product once, even if the button is pressed twice", async () => {
    const p = { id: "p2", name: "Lawn Suit", price: 5000, salePrice: null };
    await svc.broadcastNewArrival(p, [ali]); await svc.broadcastNewArrival(p, [ali]);
    expect(wa.sent).toHaveLength(1);
  });
  it("does nothing when WhatsApp is not configured", async () => {
    wa.configured = false; await svc.handleInbound("923001234567", "yes", "m7"); expect(wa.texts).toHaveLength(0); expect(statusCalls).toHaveLength(0);
  });
});

describe("webhook route", () => {
  const sign = (body: string) => "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
  const make = async () => {
    const wa = new FakeWa(); const log = new MemoryWhatsApp(); const store = new MemoryStore(); const catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store);
    const llm: LLM = { configured: true, complete: async () => "Hello!" };
    const whatsapp = new WhatsAppService({ cfg, provider: wa, store: log, inbound: { users: store, orders, assistant: new AssistantService({ cfg, llm, catalog, orders }) } });
    const app = await buildApp(cfg, { store, catalog, orders, ...emailDeps(orders, cfg), storage: new MemoryStorage(), whatsapp });
    return { app, wa };
  };
  const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "923009998888", id: "wamid.1", type: "text", text: { body: "hi" } }] } }] }] });

  it("answers Meta's verification only with the right token", async () => {
    const { app } = await make();
    const ok = await app.inject({ method: "GET", url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345" });
    expect(ok.statusCode).toBe(200); expect(ok.body).toBe("12345");
    expect((await app.inject({ method: "GET", url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1" })).statusCode).toBe(403);
  });
  it("rejects unsigned or wrongly signed deliveries", async () => {
    const { app, wa } = await make();
    expect((await app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "content-type": "application/json" }, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, payload })).statusCode).toBe(401);
    expect(wa.texts).toHaveLength(0);
  });
  it("accepts a signed delivery and replies in the background", async () => {
    const { app, wa } = await make();
    const r = await app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "content-type": "application/json", "x-hub-signature-256": sign(payload) }, payload });
    expect(r.statusCode).toBe(200);
    await vi.waitFor(() => expect(wa.texts).toEqual([{ to: "923009998888", text: "Hello!" }]));
  });
  it("the broadcast endpoint is admin only", async () => {
    const { app } = await make();
    expect((await app.inject({ method: "POST", url: "/v1/admin/whatsapp/broadcast", payload: { productId: "00000000-0000-0000-0000-000000000000" } })).statusCode).toBe(401);
  });
});
