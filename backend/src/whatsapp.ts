import type { Config } from "./config.js";
import type { OrderEvents } from "./events.js";
import { normalizePhone } from "./phone.js";
import type { OrderRec, OrderStore } from "./orderStore.js";
import type { AssistantService } from "./assistant.js";
import type { Store, User } from "./store.js";

/** WhatsApp Business Cloud API (Meta). Business-initiated messages MUST be pre-approved templates. */
export interface WhatsAppProvider { readonly name: string; readonly configured: boolean; sendTemplate(to: string, template: string, lang: string, params: string[]): Promise<void>; /** Free text: only allowed by Meta within 24h of the customer's last message (i.e. when answering a reply). */ sendText(to: string, text: string): Promise<void> }

export const noWhatsApp: WhatsAppProvider = { name: "none", configured: false, sendTemplate: async () => { throw new Error("WhatsApp is not configured"); }, sendText: async () => { throw new Error("WhatsApp is not configured"); } };

/** Template parameters may not contain new lines/tabs or long runs of spaces, and must not be empty. */
export const cleanParam = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200) || "-";

export class CloudWhatsApp implements WhatsAppProvider {
  readonly name = "cloud";
  constructor(private token: string, private phoneNumberId: string, private fetchFn: typeof fetch = fetch) {}
  get configured() { return !!this.token && !!this.phoneNumberId; }
  async sendTemplate(to: string, template: string, lang: string, params: string[]) {
    const r = await this.fetchFn(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template",
        template: { name: template, language: { code: lang }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: cleanParam(text) })) }] } }),
    });
    if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
  async sendText(to: string, text: string) {
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

export type WaKind = "welcome" | "order_confirmation" | "new_arrival" | "reply";
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
}

export const MAX_WHATSAPP_PER_NUMBER_PER_HOUR = 5;
export const MAX_REPLIES_PER_NUMBER_PER_HOUR = 20;     // protects the Anthropic bill from one chatty (or abusive) number
export const MAX_BROADCAST_RECIPIENTS = 500;
const TEMPLATE_KINDS: WaKind[] = ["welcome", "order_confirmation", "new_arrival"];
const YES_RE = /^(yes|y|yep|yeah|haan|han|ha|hanji|han ji|ji|ji han|jee|ji ha|confirm|confirmed|ok|okay|theek hai|thik hai|ہاں|جی|جی ہاں|ٹھیک ہے)[\s.!۔]*$/i;
const STOP_RE = /^(stop|unsubscribe|band|band karo|بند)[\s.!]*$/i;
const START_RE = /^(start|subscribe|shuru)[\s.!]*$/i;
interface Logger { error(o: object, m: string): void }

/**
 * Sends the welcome message (new phone account) and the order confirmation. Both are best effort and NEVER throw:
 * a WhatsApp problem can not fail a sign-up or lose an order. Failures are recorded in whatsapp_logs for the admin to see.
 */
export class WhatsAppService implements OrderEvents {
  constructor(private d: { cfg: Pick<Config, "STORE_NAME" | "WHATSAPP_LANG" | "WHATSAPP_TPL_WELCOME" | "WHATSAPP_TPL_ORDER"> & { WHATSAPP_TPL_NEW_ARRIVAL?: string }; provider: WhatsAppProvider; store: WhatsAppStore; log?: Logger;
    /** Only needed for customer replies (YES / AI answers). */
    inbound?: { users: Pick<Store, "listCustomersWithPhone">; orders: OrderStore; assistant?: AssistantService } }) {}
  get configured() { return this.d.provider.configured; }
  get providerName() { return this.d.provider.name; }

  private async send(kind: WaKind, refId: string, rawPhone: string | null | undefined, template: string, params: string[]): Promise<"sent" | "failed" | "skipped" | "none"> {
    try {
      if (!this.configured) return "none";                       // not claimed on purpose: switching WhatsApp on later must not message old orders
      const to = rawPhone ? normalizePhone(rawPhone) : null; if (!to) return "none";
      const row = await this.d.store.claim(kind, refId, to); if (!row) return "none";
      // A customer can type any number at checkout, so cap what one number can receive per hour.
      if ((await this.d.store.countRecentTo(to, 3600_000, TEMPLATE_KINDS)) > MAX_WHATSAPP_PER_NUMBER_PER_HOUR) { await this.d.store.finish(row.id, "skipped", "Too many messages to this number in the last hour"); return "skipped"; }
      try { await this.d.provider.sendTemplate(to, template, this.d.cfg.WHATSAPP_LANG, params); await this.d.store.finish(row.id, "sent", null); return "sent"; }
      catch (e) { const m = String((e as Error).message ?? e).slice(0, 500); await this.d.store.finish(row.id, "failed", m); this.d.log?.error({ kind, err: m }, "whatsapp send failed"); return "failed"; }
    } catch (e) { this.d.log?.error({ kind, err: String(e) }, "whatsapp bookkeeping failed"); return "failed"; }
  }

  /** Template {{1}} = first name, {{2}} = store name. */
  welcome(u: { id: string; fullName: string; phone: string | null }) {
    return this.send("welcome", u.id, u.phone, this.d.cfg.WHATSAPP_TPL_WELCOME, [u.fullName.trim().split(/\s+/)[0] ?? "there", this.d.cfg.STORE_NAME]);
  }
  /** Template {{1}} = name, {{2}} = order number, {{3}} = store name, {{4}} = total (PKR), {{5}} = city. */
  async orderPlaced(o: OrderRec) {
    await this.send("order_confirmation", o.id, o.customer.phone, this.d.cfg.WHATSAPP_TPL_ORDER,
      [o.customer.name, o.orderNumber, this.d.cfg.STORE_NAME, o.total.toLocaleString("en-US"), o.address.city]);
  }
  async statusChanged() {}
  recent(limit: number) { return this.d.store.recent(limit); }

  /**
   * "New product" message to every customer with a phone number who has not replied STOP. Template: {{1}} = first name, {{2}} = product,
   * {{3}} = price (PKR), {{4}} = store name. One message per (product, customer), so pressing the button twice never doubles it.
   */
  async broadcastNewArrival(p: { id: string; name: string; price: number; salePrice: number | null }, customers: Pick<User, "id" | "fullName" | "phone">[]) {
    const out = { total: 0, sent: 0, failed: 0, skipped: 0 };
    const tpl = this.d.cfg.WHATSAPP_TPL_NEW_ARRIVAL ?? "new_arrival";
    for (const u of customers.slice(0, MAX_BROADCAST_RECIPIENTS)) {
      const to = u.phone ? normalizePhone(u.phone) : null; if (!to) continue;
      out.total++;
      if (await this.d.store.isOptedOut(to)) { out.skipped++; continue; }
      const r = await this.send("new_arrival", `${p.id}:${u.id}`, u.phone, tpl,
        [u.fullName.trim().split(/\s+/)[0] || "there", p.name, (p.salePrice ?? p.price).toLocaleString("en-US"), this.d.cfg.STORE_NAME]);
      if (r === "sent") out.sent++; else if (r === "failed") out.failed++; else out.skipped++;
    }
    return out;
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
        if (YES_RE.test(body)) {
          for (const u of mine) {
            const latest = (await w.orders.listForUser(u.id, 1, 1)).items[0];
            if (latest?.status === "pending") {
              const done = await w.orders.adminSetStatus(latest.id, "confirmed", "Confirmed by the customer on WhatsApp", null, u.id);
              if (done) return `Thank you ${u.fullName.split(" ")[0]}! Your order ${latest.orderNumber} is confirmed. We will message you when it ships.`;
            }
          }
          return "You have no order waiting for confirmation right now. If you need help, just write your question here.";
        }
        if (!w.assistant?.enabled) return null;
        const r = await w.assistant.reply([{ role: "user", content: body.slice(0, 1000) }], mine[0] ?? null, `wa:${from}`);
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
