import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CatalogStore } from "../catalogStore.js";
import { conflict, notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Store } from "../store.js";
import { normalizePhone } from "../phone.js";
import { MAX_BROADCAST_RECIPIENTS, MAX_MESSAGES_PER_SEND, parseNumbers, waSpeedMinutes, type CatalogItem, type Recipient, type WhatsAppService } from "../whatsapp.js";
import type { BaileysWhatsApp } from "../waQr.js";
import type { Storage } from "../storage.js";

/** Meta signs every webhook with HMAC-SHA256(app secret, raw body). */
export function verifyMetaSignature(secret: string, raw: string, header: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex")); const got = Buffer.from(header.slice(7));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

interface Deps {
  whatsapp?: WhatsAppService; qr?: BaileysWhatsApp; storage?: Storage; auth: ReturnType<typeof makeAuth>; store: Pick<Store, "listCustomersWithPhone">; catalog: CatalogStore;
  verifyToken?: string; appSecret?: string; log?: { error(o: object, m: string): void };
}

export function whatsappRoutes(app: FastifyInstance, d: Deps) {
  const admin = { preHandler: [d.auth.admin, d.auth.requireRole("admin", "owner")] };
  // Lets the owner see whether WhatsApp is on and why a message failed (token expired, template not approved, ...).
  app.get("/admin/whatsapp", admin, async () => {
    const w = d.whatsapp;
    return { configured: !!w?.configured, provider: w?.providerName ?? "none", replies: d.qr ? true : !!(d.verifyToken && d.appSecret),
      items: w ? (await w.recent(50)).map((l) => ({ id: l.id, kind: l.kind, to: l.toPhone, status: l.status, error: l.error, createdAt: l.createdAt })) : [] };
  });

  // QR login (WHATSAPP_DRIVER=qr): the admin page polls this to show the QR code and the link state.
  app.get("/admin/whatsapp/qr", admin, async () => d.qr?.getStatus() ?? { state: "off", qr: null, phone: null });
  app.post("/admin/whatsapp/qr/pair", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    if (!d.qr) throw conflict("WhatsApp QR login is not switched on (WHATSAPP_DRIVER=qr)");
    const { phone } = z.object({ phone: z.string().min(8).max(20) }).parse(req.body);
    try { return { code: await d.qr.pair(phone) }; } catch (e) { throw conflict(String((e as Error).message ?? e)); }
  });
  app.post("/admin/whatsapp/qr/logout", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (_req, reply) => {
    if (!d.qr) throw conflict("WhatsApp QR login is not switched on (WHATSAPP_DRIVER=qr)");
    await d.qr.logout(); return reply.status(202).send({ ok: true });
  });


  // ---- Admin tools (QR mode): numbers added by hand, product messages to many people, free text messages. ----
  const qrOnly = () => {
    const w = d.whatsapp;
    if (!w || w.providerName !== "qr") throw conflict("This tool works with the QR login (WHATSAPP_DRIVER=qr).");
    if (!w.configured) throw conflict("WhatsApp is not linked right now. Scan the QR code first.");
    return w;
  };
  const audienceSchema = z.object({ audience: z.enum(["all", "customers", "contacts", "numbers"]), numbers: z.string().max(5000).optional(), speed: z.enum(["safe", "normal", "fast"]).default("safe") });
  async function audienceFor(w: WhatsAppService, a: z.infer<typeof audienceSchema>): Promise<Recipient[]> {
    const out = new Map<string, Recipient>();
    const add = (phone: string | null | undefined, name: string, ref: string) => { const n = phone ? normalizePhone(phone) : null; if (n && !out.has(n)) out.set(n, { phone: n, name, ref }); };
    if (a.audience === "all" || a.audience === "customers") for (const u of await d.store.listCustomersWithPhone()) add(u.phone, u.fullName, u.id);
    if (a.audience === "all" || a.audience === "contacts") for (const c of await w.contacts()) add(c.phone, c.name ?? "", `c:${c.id}`);
    if (a.audience === "numbers") for (const n of parseNumbers(a.numbers ?? "").valid) add(n, "", `n:${n}:${Date.now()}`);   // typed by the owner: always sent, even if sent before
    return [...out.values()];
  }

  app.get("/admin/whatsapp/contacts", admin, async () => {
    const items = d.whatsapp ? await d.whatsapp.contacts() : [];
    return { total: items.length, items: items.slice(0, 500).map((c) => ({ id: c.id, phone: c.phone, name: c.name, createdAt: c.createdAt })) };
  });
  app.post("/admin/whatsapp/contacts", { ...admin, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req) => {
    const { numbers } = z.object({ numbers: z.string().min(1).max(20000) }).parse(req.body);
    if (!d.whatsapp) throw conflict("WhatsApp is not switched on");
    const { valid, invalid } = parseNumbers(numbers);
    if (valid.length > 1000) throw conflict("Add at most 1000 numbers at a time.");
    const r = valid.length ? await d.whatsapp.addContacts(valid) : { added: 0, existing: 0 };
    return { ...r, invalid };
  });
  app.delete("/admin/whatsapp/contacts/:id", admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (!d.whatsapp || !(await d.whatsapp.deleteContact(id))) throw notFound("Number not found");
    return reply.status(204).send();
  });

  app.get("/admin/whatsapp/job", admin, async () => ({ job: d.whatsapp?.getJob() ?? null }));

  app.post("/admin/whatsapp/send-products", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = audienceSchema.extend({ productIds: z.array(z.string().uuid()).min(1).max(15) }).parse(req.body);
    const w = qrOnly();
    const items: CatalogItem[] = [];
    for (const id of new Set<string>(body.productIds)) {
      const p = await d.catalog.getProduct(id, true); if (!p) continue;         // unpublished or deleted: skipped
      const first = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      items.push({ id: p.id, name: p.name, price: p.price, salePrice: p.salePrice, description: p.description, imageUrl: first && d.storage ? d.storage.url(first.storageKey) : null });
    }
    if (!items.length) throw notFound("None of the chosen products is published");
    const audience = await audienceFor(w, body);
    if (!audience.length) throw conflict("There is nobody to send to. Add numbers or pick another audience.");
    const total = items.length * audience.length;
    if (total > MAX_MESSAGES_PER_SEND) throw conflict(`That would be ${total} messages. Send at most ${MAX_MESSAGES_PER_SEND} at a time (products x numbers): pick fewer products or send in parts.`);
    const job = w.sendProducts(items, audience, body.speed); if (!job) throw conflict("Another send is still running. Wait until it finishes.");
    return reply.status(202).send({ products: items.length, recipients: audience.length, messages: total, minutes: waSpeedMinutes(total, body.speed) });
  });

  app.post("/admin/whatsapp/send-custom", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = audienceSchema.extend({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
    const w = qrOnly();
    const audience = await audienceFor(w, body);
    if (!audience.length) throw conflict("There is nobody to send to. Add numbers or pick another audience.");
    if (audience.length > MAX_MESSAGES_PER_SEND) throw conflict(`That would be ${audience.length} messages. Send at most ${MAX_MESSAGES_PER_SEND} at a time.`);
    const job = w.sendCustom(body.text, audience, body.speed); if (!job) throw conflict("Another send is still running. Wait until it finishes.");
    return reply.status(202).send({ recipients: audience.length, messages: audience.length, minutes: waSpeedMinutes(audience.length, body.speed) });
  });

  // "Tell customers about this product": runs in the background (hundreds of messages), results appear in the list above.
  app.post("/admin/whatsapp/broadcast", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.body);
    if (!d.whatsapp?.configured) throw conflict("WhatsApp is not switched on yet (WHATSAPP_DRIVER=cloud and the token are needed)");
    const p = await d.catalog.getProduct(productId, true); if (!p) throw notFound("Product not found or not published");
    const customers = (await d.store.listCustomersWithPhone()).slice(0, MAX_BROADCAST_RECIPIENTS);
    const first = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    void d.whatsapp.broadcastNewArrival({ id: p.id, name: p.name, price: p.price, salePrice: p.salePrice, imageUrl: first && d.storage ? d.storage.url(first.storageKey) : null }, customers)
      .catch((e) => d.log?.error({ err: String(e) }, "whatsapp broadcast failed"));
    return reply.status(202).send({ queued: customers.length });
  });

  // Meta webhook. Its own scope so the raw body is available for the signature check.
  void app.register(async (hook) => {
    hook.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
    hook.get("/webhooks/whatsapp", async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      if (d.verifyToken && q["hub.mode"] === "subscribe" && q["hub.verify_token"] === d.verifyToken && q["hub.challenge"]) return reply.type("text/plain").send(q["hub.challenge"]);
      return reply.status(403).send();
    });
    hook.post("/webhooks/whatsapp", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req, reply) => {
      const raw = String(req.body ?? "");
      if (!d.whatsapp || !d.appSecret) return reply.status(503).send();
      if (!verifyMetaSignature(d.appSecret, raw, req.headers["x-hub-signature-256"] as string | undefined)) return reply.status(401).send();
      let json: any; try { json = JSON.parse(raw); } catch { return reply.status(400).send(); }
      const w = d.whatsapp;
      // Answer Meta straight away; the reply (AI call) happens in the background.
      void (async () => {
        for (const e of json?.entry ?? []) for (const c of e?.changes ?? []) for (const m of c?.value?.messages ?? [])
          if (m?.type === "text" && typeof m.from === "string" && typeof m.id === "string" && typeof m.text?.body === "string") await w.handleInbound(m.from, m.text.body, m.id);
      })().catch((err) => d.log?.error({ err: String(err) }, "whatsapp webhook failed"));
      return reply.status(200).send({ ok: true });
    });
  });
}
