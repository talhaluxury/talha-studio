import { beforeEach, describe, expect, it } from "vitest";
import { AssistantService, normaliseTurns, type ChatTurn, type LLM } from "../src/assistant.js";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { MemoryCatalog } from "../src/memoryCatalog.js";
import { MemoryOrders } from "../src/memoryOrders.js";
import { MemoryStore } from "../src/memoryStore.js";
import { MemoryWhatsApp } from "../src/memoryWhatsapp.js";
import { MemoryStorage } from "../src/storage.js";
import { WhatsAppService, cleanParam, type WhatsAppProvider } from "../src/whatsapp.js";
import { emailDeps } from "./helpers.js";

const cfg = {
  NODE_ENV: "test", EMAIL_DRIVER: "none", EMAIL_FROM: "x", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "", CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio", PORT: 0, DATABASE_URL: "x",
  JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-123", GOOGLE_WEB_CLIENT_ID: "", ADMIN_ORIGIN: "", MAX_COD_ORDER_PKR: 200000, RETURN_WINDOW_DAYS: 7, STORE_TIMEZONE: "Asia/Karachi", SHIPPING_FLAT_PKR: 299, FREE_SHIPPING_OVER_PKR: 10000,
  STORAGE_DRIVER: "local", LOCAL_MEDIA_DIR: "./media", PUBLIC_MEDIA_BASE_URL: "http://x/media", S3_ENDPOINT: "", S3_REGION: "auto", S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "",
  WHATSAPP_LANG: "en", WHATSAPP_TPL_WELCOME: "welcome_customer", WHATSAPP_TPL_ORDER: "order_confirmation", ASSISTANT_DAILY_LIMIT: 3,
} as unknown as Config;

class FakeWa implements WhatsAppProvider {
  name = "fake"; configured = true; sent: { to: string; template: string; params: string[] }[] = []; fail = false;
  async sendTemplate(to: string, template: string, _l: string, params: string[]) { if (this.fail) throw new Error("template not approved"); this.sent.push({ to, template, params }); }
}
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("WhatsApp", () => {
  let wa: FakeWa; let log: MemoryWhatsApp; let svc: WhatsAppService;
  beforeEach(() => { wa = new FakeWa(); log = new MemoryWhatsApp(); svc = new WhatsAppService({ cfg, provider: wa, store: log }); });

  it("sends one welcome per account to the normalised number, even if asked twice", async () => {
    await svc.welcome({ id: "u1", fullName: "Ali Khan", phone: "+923001234567" }); await svc.welcome({ id: "u1", fullName: "Ali Khan", phone: "+923001234567" });
    expect(wa.sent).toEqual([{ to: "923001234567", template: "welcome_customer", params: ["Ali", "Talha Studio"] }]);
  });
  it("records a failure instead of throwing, and does not retry it forever", async () => {
    wa.fail = true; await svc.welcome({ id: "u2", fullName: "Sara", phone: "03001112222" });
    expect(log.rows[0]).toMatchObject({ status: "failed" }); expect(log.rows[0]!.error).toContain("not approved");
  });
  it("does nothing (and claims nothing) when WhatsApp is not configured, so old orders are never messaged later", async () => {
    wa.configured = false; await svc.welcome({ id: "u3", fullName: "Bilal", phone: "03001112222" }); expect(log.rows).toHaveLength(0); expect(wa.sent).toHaveLength(0);
  });
  it("caps messages per number per hour", async () => {
    for (let i = 0; i < 8; i++) await svc.welcome({ id: `x${i}`, fullName: "Z", phone: "03005556666" });
    expect(wa.sent.length).toBe(5); expect(log.rows.filter((r) => r.status === "skipped")).toHaveLength(3);
  });
  it("cleans template parameters", () => { expect(cleanParam("a\nb   c")).toBe("a b c"); expect(cleanParam("  ")).toBe("-"); });

  it("signing up with a number triggers the welcome and placing an order triggers the confirmation", async () => {
    const store = new MemoryStore(); const catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store);
    const app = await buildApp(cfg, { store, catalog, orders, ...emailDeps(orders, cfg), storage: new MemoryStorage(), whatsapp: svc });
    const r = await app.inject({ method: "POST", url: "/v1/auth/phone/register", payload: { fullName: "Ali Khan", phone: "0300 1234567", password: "secret1" } });
    expect(r.statusCode).toBe(201); await flush();
    expect(wa.sent[0]).toMatchObject({ to: "923001234567", template: "welcome_customer" });
    const admin = await app.inject({ method: "GET", url: "/v1/admin/whatsapp" }); expect(admin.statusCode).toBe(401);
  });
  it("sends the order confirmation through the order events", async () => {
    await svc.orderPlaced({ id: "o1", orderNumber: "TS-1001", total: 12500, customer: { name: "Ali Khan", email: "a@b.c", phone: "0300 1234567" }, address: { city: "Lahore" } } as any);
    expect(wa.sent[0]).toEqual({ to: "923001234567", template: "order_confirmation", params: ["Ali Khan", "TS-1001", "Talha Studio", "12,500", "Lahore"] });
  });
});

describe("assistant", () => {
  const llm = (answer: string | (() => string)): LLM & { seen: { system: string; turns: ChatTurn[] }[] } => { const seen: { system: string; turns: ChatTurn[] }[] = []; return { configured: true, seen, complete: async (s, t) => { seen.push({ system: s, turns: t }); return typeof answer === "string" ? answer : answer(); } }; };
  const make = async (l: LLM) => {
    const store = new MemoryStore(); const catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store);
    const cat = await catalog.createCategory({ name: "Men", slug: "men", parentId: null, sortOrder: 0, isActive: true });
    const p = await catalog.createProduct({ sku: "S1", name: "Black Waistcoat", description: "d", categoryId: cat.id, price: 8000, salePrice: null, fabric: null, isFeatured: false, variants: [{ sku: "S1-M", size: "M", color: "Black", stock: 4 }] } as any);
    return { svc: new AssistantService({ cfg, llm: l, catalog, orders }), p };
  };
  it("turns valid [[tags]] into actions, drops unknown product ids and strips tags from the text", async () => {
    let ans = ""; const { svc, p } = await make(llm(() => ans));
    ans = `Yeh waistcoat dekhein.\n[[product:${p.id}]] [[product:00000000-0000-0000-0000-000000000000]] [[cart]]`;
    const r = await svc.reply([{ role: "user", content: "hi" }], null, "1.1.1.1");
    expect(r.reply).toBe("Yeh waistcoat dekhein."); expect(r.actions).toEqual([{ type: "product", id: p.id, label: "Black Waistcoat" }, { type: "cart", label: "Open cart" }]);
  });
  it("gives the model the real catalog and only a signed-in customer's own orders", async () => {
    const l = llm("ok"); const { svc } = await make(l);
    await svc.reply([{ role: "user", content: "price?" }], null, "3.3.3.3");
    expect(l.seen[0]!.system).toContain("Black Waistcoat"); expect(l.seen[0]!.system).toContain("not signed in");
  });
  it("enforces the daily limit and reports a model failure as a clean error", async () => {
    const { svc } = await make(llm("ok")); for (let i = 0; i < 3; i++) await svc.reply([{ role: "user", content: "hi" }], null, "4.4.4.4");
    await expect(svc.reply([{ role: "user", content: "hi" }], null, "4.4.4.4")).rejects.toMatchObject({ status: 429 });
    const bad = await make({ configured: true, complete: async () => { throw new Error("boom"); } });
    await expect(bad.svc.reply([{ role: "user", content: "hi" }], null, "5.5.5.5")).rejects.toMatchObject({ status: 502 });
  });
  it("normalises history so the API always gets alternating turns that start with the user", () => {
    expect(normaliseTurns([{ role: "assistant", content: "hello" }, { role: "user", content: "a" }, { role: "user", content: "b" }])).toEqual([{ role: "user", content: "a\nb" }]);
  });
  it("is reported as off when no key is set", async () => {
    const store = new MemoryStore(); const catalog = new MemoryCatalog(); const orders = new MemoryOrders(catalog, store);
    const app = await buildApp(cfg, { store, catalog, orders, ...emailDeps(orders, cfg), storage: new MemoryStorage() });
    expect((await app.inject({ method: "GET", url: "/v1/assistant/enabled" })).json()).toEqual({ enabled: false });
    expect((await app.inject({ method: "POST", url: "/v1/assistant", payload: { messages: [{ role: "user", content: "hi" }] } })).statusCode).toBe(503);
  });
});
