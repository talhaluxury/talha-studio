import type { FastifyInstance } from "fastify";
import type { makeAuth } from "../plugins/auth.js";
import type { WhatsAppService } from "../whatsapp.js";

export function whatsappRoutes(app: FastifyInstance, d: { whatsapp?: WhatsAppService; auth: ReturnType<typeof makeAuth> }) {
  // Lets the owner see whether WhatsApp is on and why a message failed (token expired, template not approved, ...).
  app.get("/admin/whatsapp", { preHandler: [d.auth.admin, d.auth.requireRole("admin", "owner")] }, async () => {
    const w = d.whatsapp;
    return { configured: !!w?.configured, provider: w?.providerName ?? "none",
      items: w ? (await w.recent(50)).map((l) => ({ id: l.id, kind: l.kind, to: l.toPhone, status: l.status, error: l.error, createdAt: l.createdAt })) : [] };
  });
}
