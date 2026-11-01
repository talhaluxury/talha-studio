import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { MemoryWhatsApp } from "../src/memoryWhatsapp.js";
import { parseNumbers, waSpeedMinutes, WhatsAppService, type CatalogItem, type Recipient, type WaSendOpts, type WhatsAppProvider } from "../src/whatsapp.js";

const cfg = { STORE_NAME: "Talha Studio", WHATSAPP_LANG: "en" } as unknown as Config;
class Fake implements WhatsAppProvider {
  name = "qr"; configured = true; delay = 0; texts: { to: string; text: string; opts?: WaSendOpts }[] = [];
  async sendTemplate() { /* not used here */ }
  async sendText(to: string, text: string, opts?: WaSendOpts) { if (this.delay) await new Promise((r) => setTimeout(r, this.delay)); this.texts.push({ to, text, opts }); }
}
const finished = async (svc: WhatsAppService) => { for (let i = 0; i < 400 && !svc.getJob()?.finishedAt; i++) await new Promise((r) => setTimeout(r, 5)); };
const P1: CatalogItem = { id: "p1", name: "Lawn Suit", price: 4500, salePrice: null, description: "Soft lawn, 3 piece.", imageUrl: "https://cdn.test/1.webp" };
const P2: CatalogItem = { id: "p2", name: "Kurta", price: 3000, salePrice: 2500, description: "", imageUrl: null };
const ali: Recipient = { phone: "923001234567", name: "Ali Khan", ref: "u1" };
const added: Recipient = { phone: "923211234567", name: "", ref: "c:1" };

describe("admin tools: numbers, product messages, free text", () => {
  it("reads numbers written in any common way and reports the ones that are not numbers", () => {
    const r = parseNumbers("0300 1234567, 0321-7654321\n+92 333 1112223; abc\n03001234567");
    expect(r.valid).toEqual(["923001234567", "923217654321", "923331112223"]); expect(r.invalid).toEqual(["abc"]);
  });

  it("adds numbers once and removes them", async () => {
    const store = new MemoryWhatsApp(); const svc = new WhatsAppService({ cfg, provider: new Fake(), store });
    expect(await svc.addContacts(["923001234567", "923211234567"])).toEqual({ added: 2, existing: 0 });
    expect(await svc.addContacts(["923001234567"])).toEqual({ added: 0, existing: 1 });
    const [first] = await svc.contacts(); expect(await svc.deleteContact(first!.id)).toBe(true); expect(await svc.contacts()).toHaveLength(1);
  });

  it("sends the chosen products one product at a time with the photo, skips STOP numbers, and never repeats a product to the same person", async () => {
    const store = new MemoryWhatsApp(); const wa = new Fake(); const svc = new WhatsAppService({ cfg, provider: wa, store });
    await store.setOptOut(added.phone, true);
    expect(svc.sendProducts([P1, P2], [ali, added])).not.toBeNull(); await finished(svc);
    expect(wa.texts.map((t) => t.to)).toEqual([ali.phone, ali.phone]);
    expect(wa.texts[0]!.text).toContain("Assalam o Alaikum Ali"); expect(wa.texts[0]!.text).toContain("Lawn Suit"); expect(wa.texts[0]!.text).toContain("Rs 4,500");
    expect(wa.texts[0]!.opts).toEqual({ imageUrl: "https://cdn.test/1.webp", bulk: true, speed: "safe" });
    expect(wa.texts[1]!.text).not.toContain("Assalam"); expect(wa.texts[1]!.text).toContain("Rs 2,500 (pehle Rs 3,000)");
    expect(svc.getJob()).toMatchObject({ total: 4, sent: 2, skipped: 2, failed: 0 });
    svc.sendProducts([P1, P2], [ali]); await finished(svc);
    expect(wa.texts).toHaveLength(2); expect(svc.getJob()).toMatchObject({ sent: 0, skipped: 2 });
  });

  it("passes the chosen speed on, and tells how long a send takes at each speed", async () => {
    const wa = new Fake(); const svc = new WhatsAppService({ cfg, provider: wa, store: new MemoryWhatsApp() });
    svc.sendCustom("Hi", [ali], "fast"); await finished(svc);
    expect(wa.texts[0]!.opts?.speed).toBe("fast");
    expect([waSpeedMinutes(100, "safe"), waSpeedMinutes(100, "normal"), waSpeedMinutes(100, "fast")]).toEqual([17, 9, 3]);
  });

  it("runs one send at a time", async () => {
    const wa = new Fake(); wa.delay = 20; const svc = new WhatsAppService({ cfg, provider: wa, store: new MemoryWhatsApp() });
    expect(svc.sendCustom("Hello", [ali, added])).not.toBeNull();
    expect(svc.sendCustom("Hello again", [ali])).toBeNull();
    await finished(svc); expect(svc.sendCustom("Hello again", [ali])).not.toBeNull(); await finished(svc);
  });

  it("sends a free message with the customer's first name, and the same text can be sent again later", async () => {
    const wa = new Fake(); const svc = new WhatsAppService({ cfg, provider: wa, store: new MemoryWhatsApp() });
    svc.sendCustom("Hi {name}, sale starts today!", [ali, added]); await finished(svc);
    svc.sendCustom("Hi {name}, sale starts today!", [ali]); await finished(svc);
    expect(wa.texts.map((t) => t.text)).toEqual(["Hi Ali, sale starts today!", "Hi dear customer, sale starts today!", "Hi Ali, sale starts today!"]);
  });
});
