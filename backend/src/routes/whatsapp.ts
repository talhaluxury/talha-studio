import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CatalogStore } from "../catalogStore.js";
import { conflict, notFound } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { Store } from "../store.js";
import { MAX_BROADCAST_RECIPIENTS, type WhatsAppService } from "../whatsapp.js";
import type { BaileysWhatsApp } from "../waQr.js";

/** Meta signs every webhook with HMAC-SHA256(app secret, raw body). */
export function verifyMetaSignature(secret: string, raw: string, header: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex")); const got = Buffer.from(header.slice(7));
  return got.length === expected.length && timingSafeEqual(got, expected);
}

interface Deps {
  whatsapp?: WhatsAppService; qr?: BaileysWhatsApp; auth: ReturnType<typeof makeAuth>; store: Pick<Store, "listCustomersWithPhone">; catalog: CatalogStore;
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

  // "Tell customers about this product": runs in the background (hundreds of messages), results appear in the list above.
  app.post("/admin/whatsapp/broadcast", { ...admin, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.body);
    if (!d.whatsapp?.configured) throw conflict("WhatsApp is not switched on yet (WHATSAPP_DRIVER=cloud and the token are needed)");
    const p = await d.catalog.getProduct(productId, true); if (!p) throw notFound("Product not found or not published");
    const customers = (await d.store.listCustomersWithPhone()).slice(0, MAX_BROADCAST_RECIPIENTS);
    void d.whatsapp.broadcastNewArrival({ id: p.id, name: p.name, price: p.price, salePrice: p.salePrice }, customers)
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
