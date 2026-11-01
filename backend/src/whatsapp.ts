import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import type { OrderEvents } from "./events.js";
import type { OrderStatus } from "./orderStatus.js";
import { normalizePhone } from "./phone.js";
import type { OrderRec, OrderStore } from "./orderStore.js";
import type { AssistantService, ChatTurn, DeliveryDraft } from "./assistant.js";
import type { Store, User } from "./store.js";

/** WhatsApp Business Cloud API (Meta). Business-initiated messages MUST be pre-approved templates. */
/** Optional extras for a message: a picture, and (QR mode) the full ready-made text instead of the approved-template wording. */
export interface WaMedia { imageUrl?: string | null; text?: string }
/** imageUrl: send a picture with the text as caption (QR mode). bulk: use the slow lane meant for many messages. */
export type WaSpeed = "safe" | "normal" | "fast";
export interface WaSendOpts { imageUrl?: string | null; bulk?: boolean; speed?: WaSpeed }
/** Pause between two bulk messages, in ms: [minimum, extra random part]. Faster means a higher chance that WhatsApp bans the number. */
export const WA_SPEED_GAP: Record<WaSpeed, [number, number]> = { safe: [6000, 8000], normal: [3000, 4000], fast: [1000, 2000] };
export const waSpeedMinutes = (messages: number, speed: WaSpeed) => Math.max(1, Math.ceil((messages * (WA_SPEED_GAP[speed][0] + WA_SPEED_GAP[speed][1] / 2)) / 60000));
export interface WhatsAppProvider { readonly name: string; readonly configured: boolean; sendTemplate(to: string, template: string, lang: string, params: string[], media?: WaMedia): Promise<void>; /** Free text: only allowed by Meta within 24h of the customer's last message (i.e. when answering a reply). */ sendText(to: string, text: string, opts?: WaSendOpts): Promise<void> }

export const noWhatsApp: WhatsAppProvider = { name: "none", configured: false, sendTemplate: async () => { throw new Error("WhatsApp is not configured"); }, sendText: async () => { throw new Error("WhatsApp is not configured"); } };

/** Template parameters may not contain new lines/tabs or long runs of spaces, and must not be empty. */
export const cleanParam = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200) || "-";

export class CloudWhatsApp implements WhatsAppProvider {
  readonly name = "cloud";
  constructor(private token: string, private phoneNumberId: string, private fetchFn: typeof fetch = fetch) {}
  get configured() { return !!this.token && !!this.phoneNumberId; }
  async sendTemplate(to: string, template: string, lang: string, params: string[], _media?: WaMedia) {
    const r = await this.fetchFn(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template",
        template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: cleanParam(text) })) }] } }),
    });
    if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
  async sendText(to: string, text: string, _opts?: WaSendOpts) {
    const r = await this.fetchFn(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 1500), preview_url: false } }),
    });
    if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
}
export function createWhatsAppProvider(cfg: Pick<Config, "WHATSAPP_DRIVER" | "WHATSAPP_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID">): WhatsAppProvider {
  return cfg.WHATSAPP_DRIVER === "cloud" ? new CloudWhatsApp(cfg.WHATSAPP_TOKEN, cfg.WHATSAPP_PHONE_NUMBER_ID) : noWhatsApp;
}

export type WaKind = "welcome" | "order_confirmation" | "new_arrival" | "reply" | "address_ok" | "address_fix" | "custom";
export type WaStatus = "sending" | "sent" | "failed" | "skipped";
export interface WaLog { id: string; kind: WaKind; refId: string; toPhone: string; status: WaStatus; error: string | null; createdAt: Date }
export interface WhatsAppStore {
  /** Reserves (kind, refId). Returns null when it was already handled, so the same message is never sent twice. */
  claim(kind: WaKind, refId: string, toPhone: string): Promise<WaLog | null>;
  finish(id: string, status: WaStatus, error: string | null): Promise<void>;
  countRecentTo(toPhone: string, windowMs: number, kinds?: WaKind[]): Promise<number>;
  recent(limit: number): Promise<WaLog[]>;
  /** True the first time a customer message id is seen (Meta retries deliveries). */
  markInbound(messageId: string): Promise<boolean>;
  setOptOut(phone: string, optedOut: boolean): Promise<void>;
  isOptedOut(phone: string): Promise<boolean>;
  /** The product most recently sent to this number as a new-product message (so the AI knows what the customer is asking about). */
  lastNewArrival(phone: string): Promise<{ productId: string; at: Date } | null>;
  /** The customer said the delivery details are wrong and we are waiting for the correct ones (open for 24 hours). */
  awaitingAddress(phone: string): Promise<{ id: string; orderId: string } | null>;
  addContacts(phones: string[]): Promise<{ added: number; existing: number }>;
  listContacts(): Promise<WaContact[]>;
  deleteContact(id: string): Promise<boolean>;
}

export interface WaContact { id: string; phone: string; name: string | null; createdAt: Date }
/** Who a bulk message goes to. ref = the user id, or "c:<contact id>" for a number the owner added by hand. */
export interface Recipient { phone: string; name: string; ref: string }
export interface CatalogItem { id: string; name: string; price: number; salePrice: number | null; description: string; imageUrl: string | null }
export interface WaJob { id: string; kind: "products" | "custom"; total: number; done: number; sent: number; failed: number; skipped: number; startedAt: Date; finishedAt: Date | null }
/** One admin send may not queue more than this many messages (products x numbers): a new number that suddenly sends thousands gets banned. */
export const MAX_MESSAGES_PER_SEND = 600;

/** "0300 1234567, 0321-7654321" or one per line. Pieces that are not a phone number come back as invalid. */
export function parseNumbers(text: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>(); const invalid: string[] = [];
  for (const piece of text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const one = normalizePhone(piece);
    if (one) { valid.add(one); continue; }
    const many = piece.split(/\s+/).map((x) => normalizePhone(x)).filter((x): x is string => !!x);
    if (many.length > 1) many.forEach((x) => valid.add(x)); else invalid.push(piece.slice(0, 40));
  }
  return { valid: [...valid], invalid };
}

export const MAX_WHATSAPP_PER_NUMBER_PER_HOUR = 5;
export const MAX_REPLIES_PER_NUMBER_PER_HOUR = 20;     // protects the Anthropic bill from one chatty (or abusive) number
export const MAX_BROADCAST_RECIPIENTS = 500;
const TEMPLATE_KINDS: WaKind[] = ["welcome", "order_confirmation", "new_arrival"];
const YES_RE = /^(yes|y|yep|yeah|haan|han|ha|hanji|han ji|ji|ji han|jee|ji ha|confirm|confirmed|ok|okay|theek hai|thik hai|ہاں|جی|جی ہاں|ٹھیک ہے)[\s.!۔]*$/i;
// Natural sentences count too ("han ye address sahi hai"), but never questions, negations or longer messages.
const POS_RE = /\b(yes|yep|yeah|yup|haan|han|haa|hanji|ji|jee|theek|thik|sahi|sahih|correct|right|confirm|confirmed|ok|okay|bilkul|done|sure|perfect)\b|ہاں|جی|ٹھیک|صحیح|درست|بالکل/i;
const NEG_RE = /\b(nahi|nahin|nhi|no|not|na|galat|ghalat|wrong|incorrect|change|badal|badlo|cancel|mat|nope|but|lekin|magar|par)\b|نہیں|غلط|بدل|منسوخ/i;
const ASK_RE = /[?؟]|\b(kya|kab|kitn[aei]|kaise|kyun|kyu|kaun|kahan|why|what|when|how|which|where|price|rate)\b|کیا|کب|کتن|کیسے|کیوں/i;
export const isAffirm = (t: string) => { const x = t.trim(); return x.length > 0 && x.length <= 60 && x.split(/\s+/).length <= 8 && POS_RE.test(x) && !NEG_RE.test(x) && !ASK_RE.test(x); };
// "address galat hai", "number change karna hai": only counts when it is about the address/number or is a very short "wrong".
const WRONG_RE = /\b(galat|ghalat|wrong|incorrect|badal|badlo|badalna|change|different|doosra|dusra|naya|new|sahi nahi|sahi nhi|theek nahi|thik nahi|correct nahi)\b|غلط|بدل|نیا/i;
const ADDR_RE = /\b(address|adress|pata|patah|number|nmbr|phone|mobile|house|street|gali|mohalla|sector|block)\b|ایڈریس|پتہ|نمبر/i;
const wantsFix = (t: string) => WRONG_RE.test(t) && (ADDR_RE.test(t) || t.trim().split(/\s+/).length <= 4);
const STOP_RE = /^(stop|unsubscribe|band|band karo|بند)[\s.!]*$/i;
const START_RE = /^(start|subscribe|shuru)[\s.!]*$/i;
interface Logger { error(o: object, m: string): void }

/**
 * Sends the welcome message (new phone account) and the order confirmation. Both are best effort and NEVER throw:
 * a WhatsApp problem can not fail a sign-up or lose an order. Failures are recorded in whatsapp_logs for the admin to see.
 */
export class WhatsAppService implements OrderEvents {
  /** Short memory of each chat (in RAM only) so follow-ups like "and the price?" make sense. */
  private convo = new Map<string, { at: number; turns: ChatTurn[] }>();
  /** Delivery details a customer is giving us piece by piece (address first, number next). */
  private drafts = new Map<string, { orderId: string; at: number; d: DeliveryDraft }>();
  constructor(private d: { cfg: Pick<Config, "STORE_NAME" | "WHATSAPP_LANG" | "WHATSAPP_TPL_WELCOME" | "WHATSAPP_TPL_ORDER"> & { WHATSAPP_TPL_NEW_ARRIVAL?: string }; provider: WhatsAppProvider; store: WhatsAppStore; log?: Logger;
    /** Public URL of a stored picture (order messages show the product photo). */ mediaUrl?: (key: string) => string;
    /** Runs after a customer confirmed an order on WhatsApp (app notification). Failures are logged, never raised. */ onConfirmed?: (o: OrderRec, prev: OrderStatus) => Promise<void>;
    /** Only needed for customer replies (YES / AI answers). */
    inbound?: { users: Pick<Store, "listCustomersWithPhone"> & Partial<Pick<Store, "findUserById">>; orders: OrderStore; assistant?: AssistantService } }) {}
  get configured() { return this.d.provider.configured; }
  get providerName() { return this.d.provider.name; }

  private async send(kind: WaKind, refId: string, rawPhone: string | null | undefined, template: string, params: string[], media?: WaMedia): Promise<"sent" | "failed" | "skipped" | "none"> {
    try {
      if (!this.configured) return "none";                       // not claimed on purpose: switching WhatsApp on later must not message old orders
      const to = rawPhone ? normalizePhone(rawPhone) : null; if (!to) return "none";
      const row = await this.d.store.claim(kind, refId, to); if (!row) return "none";
      // A customer can type any number at checkout, so cap what one number can receive per hour.
      if ((await this.d.store.countRecentTo(to, 3600_000, TEMPLATE_KINDS)) > MAX_WHATSAPP_PER_NUMBER_PER_HOUR) { await this.d.store.finish(row.id, "skipped", "Too many messages to this number in the last hour"); return "skipped"; }
      try { await this.d.provider.sendTemplate(to, template, this.d.cfg.WHATSAPP_LANG, params, media); await this.d.store.finish(row.id, "sent", null); return "sent"; }
      catch (e) { const m = String((e as Error).message ?? e).slice(0, 500); await this.d.store.finish(row.id, "failed", m); this.d.log?.error({ kind, err: m }, "whatsapp send failed"); return "failed"; }
    } catch (e) { this.d.log?.error({ kind, err: String(e) }, "whatsapp bookkeeping failed"); return "failed"; }
  }

  /** Template {{1}} = first name, {{2}} = store name. */
  welcome(u: { id: string; fullName: string; phone: string | null }) {
    return this.send("welcome", u.id, u.phone, this.d.cfg.WHATSAPP_TPL_WELCOME, [u.fullName.trim().split(/\s+/)[0] ?? "there", this.d.cfg.STORE_NAME]);
  }

  /** The customer says the address or number is wrong: collect the corrected details here and update the order itself. Returns null when this message is not about that. */
  private async deliveryFlow(from: string, body: string, mine: { id: string; fullName: string }[]): Promise<string | null> {
    const w = this.d.inbound; if (!w?.assistant?.enabled) return null;
    const waiting = await this.d.store.awaitingAddress(from);
    if (!waiting && !wantsFix(body)) return null;
    for (const u of mine) {
      const latest = (await w.orders.listForUser(u.id, 1, 1)).items[0];
      if (!latest || !["pending", "confirmed"].includes(latest.status) || (waiting && waiting.orderId !== latest.id)) continue;
      const order = await w.orders.getForUser(u.id, latest.id); if (!order) continue;
      const first = u.fullName.split(" ")[0] || "";
      let rowId = waiting?.id;
      if (!rowId) {
        if (await this.d.store.countRecentTo(from, 86_400_000, ["address_fix"]) >= 4) return "Hamari team aap ki delivery details dekh kar jald yahin rabta karegi. 🙏";
        const row = await this.d.store.claim("address_fix", `${latest.id}:${Date.now()}`, from); if (!row) return null;
        rowId = row.id;
      }
      const got = await w.assistant.extractDelivery(body);
      const before = this.drafts.get(from); const draft: DeliveryDraft = before && before.orderId === latest.id && Date.now() - before.at < 86_400_000 ? { ...before.d } : {};
      for (const [k, v] of Object.entries(got ?? {})) if (v !== undefined && v !== false) (draft as Record<string, unknown>)[k] = v;
      const digits = draft.sameNumber ? normalizePhone(order.customer.phone) : draft.phone ? normalizePhone(draft.phone) : null;
      if (draft.phone && !draft.sameNumber && !digits) delete draft.phone;           // not a usable number: ask again
      const phone = digits ? (digits.startsWith("92") ? `0${digits.slice(2)}` : digits) : null;
      const sameCity = !!draft.city && draft.city.toLowerCase() === order.address.city.toLowerCase();
      const province = draft.province ?? (sameCity ? order.address.province : undefined);
      const needAddr = !draft.line1 || !draft.city;
      this.drafts.set(from, { orderId: latest.id, at: Date.now(), d: draft });
      if (needAddr && !phone) return `Koi baat nahi ${first}! 🙏 Please sahi delivery address bhej dein (ghar/street number, area, city aur province) aur saath wo mobile number bhi likh dein jis par delivery ke waqt aap se rabta ho sake.`;
      if (needAddr) return `Shukriya ${first}! Number ${phone} note kar liya hai. Ab please sahi delivery address bhej dein (ghar/street number, area, city aur province).`;
      if (!province) return `Shukriya ${first}! Address note kar liya hai. Aap ka shehar kis province mein hai? (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan wagera)`;
      if (!phone) return `Shukriya ${first}! Address note kar liya hai. Ab wo mobile number bata dein jis par delivery ke waqt rider aap ko call kar sake. Agar ${order.customer.phone} hi active hai to bas "same" likh dein.`;
      try {
        const done = await w.orders.updateDelivery(latest.id, u.id, { address: { line1: draft.line1!, line2: draft.line2 ?? null, city: draft.city!, province, postalCode: draft.postalCode ?? order.address.postalCode }, phone },
          "Delivery address and phone updated by the customer on WhatsApp");
        await this.d.store.finish(rowId, "sent", null); this.drafts.delete(from);
        if (!done) return null;
        const addr = [done.address.line1, done.address.line2, done.address.city, done.address.province, done.address.postalCode].filter(Boolean).join(", ");
        return `Shukriya ${first}! ✅ Maine aap ki delivery details update kar di hain:\n\n📍 ${addr}\n📞 ${phone}\n\nKindly confirm kar dein ke ab address aur number sahi hain. Sahi hon to "YES" likh dein.`;
      } catch (e) {
        await this.d.store.finish(rowId, "failed", String((e as Error).message ?? e)); this.drafts.delete(from);
        return "Aap ka order tayyar ho raha hai, is liye address yahan se change nahi ho sakta. Hamari team aap se jald yahin rabta karegi. 🙏";
      }
    }
    return null;
  }

  /** QR mode: the full order message (items, total, delivery address) that asks the customer to confirm the address. */
  private orderText(o: OrderRec) {
    const first = o.customer.name.trim().split(/\s+/)[0] || "there";
    const lines = o.items.slice(0, 5).map((i) => { const opt = [i.size, i.color].filter(Boolean).join(", "); return `• ${i.name}${opt ? ` (${opt})` : ""} x${i.qty}`; });
    if (o.items.length > 5) lines.push(`• aur ${o.items.length - 5} items`);
    const addr = [o.address.line1, o.address.line2, o.address.city, o.address.province, o.address.postalCode].filter(Boolean).join(", ");
    return `Assalam o Alaikum ${first}! 🌸
Main ${this.d.cfg.STORE_NAME} ki assistant hun. Aap ka order ${o.orderNumber} humein mil gaya hai, bohat shukriya!

🛍️ Aap ka order:
${lines.join("\n")}

💰 Total: Rs ${o.total.toLocaleString("en-US")} (Cash on Delivery)

📍 Delivery address:
${o.customer.name}, ${o.customer.phone}
${addr}

📞 Delivery ke waqt rider is number par aap ko call karega:
${o.customer.phone}

Kindly confirm kar dein ke address aur ye number dono bilkul sahi hain, aur number delivery wale din active rahega, taake rider ko koi pareshani na ho aur order jaldi dispatch ho sake.

Sab sahi hai to "YES" likh dein. Agar kuch galat hai to bas "galat hai" likh dein, hum yahin sahi address aur number note karke aap ke order mein update kar denge.`;
  }
  /** Template {{1}} = name, {{2}} = order number, {{3}} = store name, {{4}} = total (PKR), {{5}} = city. In QR mode the full message with the product photo is sent instead. */
  async orderPlaced(o: OrderRec) {
    const first = o.items?.[0];
    const media: WaMedia | undefined = this.d.provider.name === "qr" ? { text: this.orderText(o), imageUrl: first?.thumbKey && this.d.mediaUrl ? this.d.mediaUrl(first.thumbKey) : null } : undefined;
    await this.send("order_confirmation", o.id, o.customer.phone, this.d.cfg.WHATSAPP_TPL_ORDER,
      [o.customer.name, o.orderNumber, this.d.cfg.STORE_NAME, o.total.toLocaleString("en-US"), o.address.city], media);
  }
  async statusChanged() {}
  recent(limit: number) { return this.d.store.recent(limit); }

  /**
   * "New product" message to every customer with a phone number who has not replied STOP. Template: {{1}} = first name, {{2}} = product,
   * {{3}} = price (PKR), {{4}} = store name. One message per (product, customer), so pressing the button twice never doubles it.
   */
  async broadcastNewArrival(p: { id: string; name: string; price: number; salePrice: number | null; imageUrl?: string | null }, customers: Pick<User, "id" | "fullName" | "phone">[]) {
    const out = { total: 0, sent: 0, failed: 0, skipped: 0 };
    const tpl = this.d.cfg.WHATSAPP_TPL_NEW_ARRIVAL ?? "new_arrival";
    for (const u of customers.slice(0, MAX_BROADCAST_RECIPIENTS)) {
      const to = u.phone ? normalizePhone(u.phone) : null; if (!to) continue;
      out.total++;
      if (await this.d.store.isOptedOut(to)) { out.skipped++; continue; }
      const r = await this.send("new_arrival", `${p.id}:${u.id}`, u.phone, tpl,
        [u.fullName.trim().split(/\s+/)[0] || "there", p.name, (p.salePrice ?? p.price).toLocaleString("en-US"), this.d.cfg.STORE_NAME], p.imageUrl ? { imageUrl: p.imageUrl } : undefined);
      if (r === "sent") out.sent++; else if (r === "failed") out.failed++; else out.skipped++;
    }
    return out;
  }


  // ---- Admin tools (QR mode): numbers added by hand, product messages to many people, free text messages. ----
  contacts() { return this.d.store.listContacts(); }
  addContacts(phones: string[]) { return this.d.store.addContacts(phones); }
  deleteContact(id: string) { return this.d.store.deleteContact(id); }
  private job: WaJob | null = null;
  getJob() { return this.job; }

  /** Free text (with an optional picture): claimed once per (kind, refId), opt-outs respected, result logged. */
  private async sendFree(kind: WaKind, refId: string, phone: string, text: string, imageUrl: string | null | undefined, speed: WaSpeed): Promise<"sent" | "failed" | "skipped"> {
    try {
      if (!this.configured) return "failed";
      if (await this.d.store.isOptedOut(phone)) return "skipped";
      const row = await this.d.store.claim(kind, refId, phone); if (!row) return "skipped";
      try { await this.d.provider.sendText(phone, text, { imageUrl, bulk: true, speed }); await this.d.store.finish(row.id, "sent", null); return "sent"; }
      catch (e) { const m = String((e as Error).message ?? e).slice(0, 500); await this.d.store.finish(row.id, "failed", m); this.d.log?.error({ kind, err: m }, "whatsapp send failed"); return "failed"; }
    } catch (e) { this.d.log?.error({ kind, err: String(e) }, "whatsapp bookkeeping failed"); return "failed"; }
  }
  private begin(kind: WaJob["kind"], total: number): WaJob | null {
    if (this.job && !this.job.finishedAt) return null;            // one send at a time
    return (this.job = { id: randomUUID(), kind, total, done: 0, sent: 0, failed: 0, skipped: 0, startedAt: new Date(), finishedAt: null });
  }
  private tick(job: WaJob, r: "sent" | "failed" | "skipped") { job.done++; if (r === "sent") job.sent++; else if (r === "failed") job.failed++; else job.skipped++; }

  /** The chosen products, one product at a time to everybody (so nobody gets a burst of pictures). Returns null while another send is still running. */
  sendProducts(items: CatalogItem[], audience: Recipient[], speed: WaSpeed = "safe"): WaJob | null {
    const job = this.begin("products", items.length * audience.length); if (!job) return null;
    const rs = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
    void (async () => {
      try {
        for (const [i, p] of items.entries()) for (const r of audience) {
          const first = r.name.trim().split(/\s+/)[0] ?? "";
          const desc = p.description.replace(/\s+/g, " ").trim();
          const text = `${i === 0 ? `Assalam o Alaikum${first ? ` ${first}` : ""}! 🌸 ${this.d.cfg.STORE_NAME} ki taraf se:\n\n` : ""}✨ ${p.name}\n💰 ${p.salePrice != null ? `${rs(p.salePrice)} (pehle ${rs(p.price)})` : rs(p.price)}${desc ? `\n\n${desc.slice(0, 160)}${desc.length > 160 ? "..." : ""}` : ""}`;
          this.tick(job, await this.sendFree("new_arrival", `${p.id}:${r.ref}`, r.phone, text, p.imageUrl, speed));
        }
      } finally { job.finishedAt = new Date(); }
    })().catch((e) => this.d.log?.error({ err: String(e) }, "whatsapp product send failed"));
    return job;
  }

  /** Any message the owner writes. {name} becomes the customer's first name. */
  sendCustom(text: string, audience: Recipient[], speed: WaSpeed = "safe"): WaJob | null {
    const job = this.begin("custom", audience.length); if (!job) return null;
    const batch = randomUUID();
    void (async () => {
      try {
        for (const r of audience) {
          const first = r.name.trim().split(/\s+/)[0] || "dear customer";
          this.tick(job, await this.sendFree("custom", `${batch}:${r.ref}`, r.phone, text.replaceAll("{name}", first), null, speed));
        }
      } finally { job.finishedAt = new Date(); }
    })().catch((e) => this.d.log?.error({ err: String(e) }, "whatsapp custom send failed"));
    return job;
  }

  /** A customer wrote to the store number. YES confirms their pending order, STOP/START toggles promotions, anything else goes to the AI assistant. Never throws. */
  async handleInbound(rawFrom: string, text: string, messageId: string) {
    try {
      const w = this.d.inbound; const from = normalizePhone(rawFrom);
      if (!this.configured || !w || !from) return;
      if (!(await this.d.store.markInbound(messageId))) return;           // Meta delivered this one before
      const body = text.trim(); if (!body) return;
      if ((await this.d.store.countRecentTo(from, 3600_000, ["reply"])) >= MAX_REPLIES_PER_NUMBER_PER_HOUR) return;
      const row = await this.d.store.claim("reply", messageId, from); if (!row) return;
      const answer = async (): Promise<string | null> => {
        if (STOP_RE.test(body)) { await this.d.store.setOptOut(from, true); return `You will no longer get promotional WhatsApp messages from ${this.d.cfg.STORE_NAME}. Order updates still reach you. Reply START to subscribe again.`; }
        if (START_RE.test(body)) { await this.d.store.setOptOut(from, false); return `Thank you! You will hear from ${this.d.cfg.STORE_NAME} about new arrivals again. Reply STOP any time to unsubscribe.`; }
        const mine = (await w.users.listCustomersWithPhone()).filter((u) => normalizePhone(u.phone ?? "") === from);
        // The order message goes to the phone typed at CHECKOUT, which can differ from the account's phone. Also treat the owner of a
        // pending order with this checkout phone as "this customer", so YES / "galat hai" still find the order.
        if (w.users.findUserById) {
          const seen = new Set(mine.map((u) => u.id));
          const open = await w.orders.adminList({ status: "pending", page: 1, limit: 100 });
          for (const s of open.items) {
            if (normalizePhone(s.customerPhone) !== from) continue;
            const o = await w.orders.adminGet(s.id); if (!o?.userId || seen.has(o.userId)) continue;
            const u = await w.users.findUserById(o.userId);
            if (u && u.role === "customer" && u.isActive && !u.deletedAt) { mine.push(u); seen.add(u.id); }
          }
        }
        const fixed = await this.deliveryFlow(from, body, mine); if (fixed) return fixed;
        const exactYes = YES_RE.test(body);
        if (exactYes || isAffirm(body)) {
          let already: string | null = null;
          for (const u of mine) {
            const latest = (await w.orders.listForUser(u.id, 1, 1)).items[0];
            if (latest && ["confirmed", "processing"].includes(latest.status)) already ??= latest.orderNumber;
            if (latest?.status !== "pending") continue;
            const first = u.fullName.split(" ")[0];
            // 1st yes = "the address is correct" (remembered per order), 2nd yes = "confirm the order".
            const step = await this.d.store.claim("address_ok", latest.id, from);
            if (step) { await this.d.store.finish(step.id, "sent", null); return `Shukriya ${first}! ✅ Aap ka address aur number note kar liye gaye hain.\nAb kya main aap ka order ${latest.orderNumber} confirm kar dun? Confirm karne ke liye "YES" likh dein.`; }
            const done = await w.orders.adminSetStatus(latest.id, "confirmed", "Confirmed by the customer on WhatsApp", null, u.id);
            if (done) {
              await this.d.onConfirmed?.(done, "pending").catch((e) => this.d.log?.error({ err: String(e) }, "whatsapp order-confirmed event failed"));
              return `Shukriya ${first}! ✅ Aap ka order ${latest.orderNumber} confirm ho gaya hai. Hum isay jald dispatch karenge, shipping ki update yahin aur app mein milti rahegi. ${this.d.cfg.STORE_NAME} se shopping ka bohat shukriya! 🌸`;
            }
          }
          if (exactYes && already) return `Aap ka order ${already} pehle hi confirm ho chuka hai ✅ (You have no order waiting for confirmation right now.) Koi sawal ho to yahin likh dein.`;
          if (exactYes) return "You have no order waiting for confirmation right now. If you need help, just write your question here.";
        }
        if (!w.assistant?.enabled) return null;
        const now = Date.now(); const old = this.convo.get(from);
        const history = old && now - old.at < 12 * 3600_000 ? old.turns : [];
        const turns: ChatTurn[] = [...history, { role: "user" as const, content: body.slice(0, 1000) }].slice(-4);
        const last = await this.d.store.lastNewArrival(from);
        const productId = last && now - last.at.getTime() < 14 * 86_400_000 ? last.productId : null;   // only a recent message makes a product "the one we are talking about"
        const r = await w.assistant.reply(turns, mine[0] ?? null, `wa:${from}`, { channel: "whatsapp", productId });
        this.convo.set(from, { at: now, turns: [...turns, { role: "assistant" as const, content: r.reply }].slice(-4) });
        if (this.convo.size > 2000) for (const [k, v] of this.convo) if (now - v.at > 12 * 3600_000) this.convo.delete(k);
        return r.reply;
      };
      let text2: string | null = null;
      try { text2 = await answer(); } catch (e) { await this.d.store.finish(row.id, "failed", String((e as Error).message ?? e).slice(0, 500)); return; }
      if (!text2) { await this.d.store.finish(row.id, "skipped", "Assistant is not configured"); return; }
      try { await this.d.provider.sendText(from, text2); await this.d.store.finish(row.id, "sent", null); }
      catch (e) { const m = String((e as Error).message ?? e).slice(0, 500); await this.d.store.finish(row.id, "failed", m); this.d.log?.error({ kind: "reply", err: m }, "whatsapp reply failed"); }
    } catch (e) { this.d.log?.error({ kind: "reply", err: String(e) }, "whatsapp inbound failed"); }
  }
}
