import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ChatMsg, ChatStore } from "../chatStore.js";
import { notFound } from "../errors.js";
import type { ImageProcessor } from "../images.js";
import type { makeAuth } from "../plugins/auth.js";
import type { PushService } from "../pushService.js";
import type { Storage } from "../storage.js";
import type { Store } from "../store.js";
import { readUpload } from "./content.js";

const text = z.object({ body: z.string().trim().min(1).max(2000) });
const after = z.object({ after: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const CHAT_DEEP_LINK = "talhastudio://chat";

export const toApiMsg = (m: ChatMsg, s: Storage) => ({ seq: m.seq, id: m.id, sender: m.sender, body: m.body, imageUrl: m.imageKey ? s.url(m.imageKey) : null, createdAt: m.createdAt, read: !!m.readAt });

export function chatRoutes(app: FastifyInstance, d: { chat: ChatStore; store: Store; storage: Storage; images: ImageProcessor; push: PushService; auth: ReturnType<typeof makeAuth> }) {
  const { chat, store, storage, images, push, auth } = d;
  const me = { preHandler: auth.customer };
  const staff = { preHandler: auth.admin };
  const sendLimit = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
  const imgLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  const saveImage = async (req: any, customerId: string) => {
    const { out } = await readUpload(req, images); const key = `chat/${customerId}/${randomUUID()}.webp`; await storage.put(key, out.full, "image/webp"); return key;
  };
  const customerOrNull = async (id: string) => { const u = await store.findUserById(id); return u && u.role === "customer" && !u.deletedAt ? u : null; };

  // ---- customer side: one conversation with the store ----
  app.get("/me/chat", me, async (req) => {
    const q = after.parse(req.query); const items = await chat.list(req.user!.id, q.after ?? null, q.limit);
    return { items: items.map((m) => toApiMsg(m, storage)) };
  });
  app.post("/me/chat", { ...me, ...sendLimit }, async (req, reply) => reply.status(201).send(toApiMsg(await chat.add(req.user!.id, "customer", text.parse(req.body).body, null), storage)));
  app.post("/me/chat/image", { ...me, ...imgLimit }, async (req, reply) => {
    const key = await saveImage(req, req.user!.id); return reply.status(201).send(toApiMsg(await chat.add(req.user!.id, "customer", "", key), storage));
  });
  app.post("/me/chat/read", me, async (req, reply) => { await chat.markRead(req.user!.id, "customer"); return reply.status(204).send(); });
  app.get("/me/chat/unread", me, async (req) => ({ unread: await chat.unreadForCustomer(req.user!.id) }));

  // ---- store side (any staff member can answer customers) ----
  app.get("/admin/chat", staff, async (req) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(500).default(1), limit: z.coerce.number().int().min(1).max(50).default(30) }).parse(req.query);
    const r = await chat.conversations(q.page, q.limit);
    const items = await Promise.all(r.items.map(async (c) => {
      const u = await store.findUserById(c.customerId);
      return { customerId: c.customerId, name: u?.fullName ?? "Customer", phone: u?.phone ?? null, unread: c.unread, last: toApiMsg(c.last, storage) };
    }));
    return { items, page: q.page, limit: q.limit, total: r.total, unreadTotal: r.unreadTotal };
  });
  app.get<{ Params: { customerId: string } }>("/admin/chat/:customerId", staff, async (req) => {
    const id = z.string().uuid().parse(req.params.customerId); const u = await customerOrNull(id); if (!u) throw notFound("Customer not found");
    const q = after.parse(req.query);
    return { customer: { id: u.id, name: u.fullName, phone: u.phone }, items: (await chat.list(id, q.after ?? null, q.limit)).map((m) => toApiMsg(m, storage)) };
  });
  const reply = async (req: any, customerId: string, msg: ChatMsg) => {
    // Phone notification is best effort and never delays or fails the reply.
    void push.chatReply(customerId, msg.body || "Sent you a photo", CHAT_DEEP_LINK);
    return toApiMsg(msg, storage);
  };
  app.post<{ Params: { customerId: string } }>("/admin/chat/:customerId", { ...staff, ...sendLimit }, async (req, rep) => {
    const id = z.string().uuid().parse(req.params.customerId); if (!(await customerOrNull(id))) throw notFound("Customer not found");
    return rep.status(201).send(await reply(req, id, await chat.add(id, "store", text.parse(req.body).body, null)));
  });
  app.post<{ Params: { customerId: string } }>("/admin/chat/:customerId/image", { ...staff, ...imgLimit }, async (req, rep) => {
    const id = z.string().uuid().parse(req.params.customerId); if (!(await customerOrNull(id))) throw notFound("Customer not found");
    return rep.status(201).send(await reply(req, id, await chat.add(id, "store", "", await saveImage(req, id))));
  });
  app.post<{ Params: { customerId: string } }>("/admin/chat/:customerId/read", staff, async (req, rep) => { await chat.markRead(z.string().uuid().parse(req.params.customerId), "store"); return rep.status(204).send(); });
}
