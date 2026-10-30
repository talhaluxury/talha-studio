import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound, unauthorized } from "../errors.js";
import { verifyPassword } from "../security.js";
import type { Store } from "../store.js";
import { publicUser } from "./auth.js";

const phone = z.string().trim().regex(/^\+?[0-9 \-]{7,16}$/, "Invalid phone");
const addr = z.object({
  label: z.string().trim().max(40).nullable().optional(),
  recipient: z.string().trim().min(2).max(100), phone,
  line1: z.string().trim().min(3).max(200), line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(2).max(80), province: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(12).nullable().optional(), isDefault: z.boolean().default(false),
});
const norm = (a: z.infer<typeof addr>) => ({ ...a, label: a.label ?? null, line2: a.line2 ?? null, province: a.province ?? null, postalCode: a.postalCode ?? null });

export function meRoutes(app: FastifyInstance, d: { store: Store; auth: ReturnType<typeof import("../plugins/auth.js").makeAuth>; onDelete?: (userId: string) => Promise<void> }) {
  const { store, auth, onDelete } = d;
  const pre = { preHandler: auth.customer };

  app.get("/me", pre, async (req) => ({ user: publicUser(req.user!) }));

  app.patch("/me", pre, async (req) => {
    const b = z.object({ fullName: z.string().trim().min(2).max(100).optional(), phone: phone.nullable().optional() }).parse(req.body);
    return { user: publicUser(await store.updateUser(req.user!.id, b)) };
  });

  // Account deletion (Play policy): anonymises the profile; order records are kept for accounting.
  // Also exposed as POST /me/delete because some mobile HTTP stacks cannot send a body with DELETE.
  const deleteAccount = async (req: any, reply: any) => {
    const u = req.user!;
    if (u.passwordHash) {
      const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body ?? {});
      if (!(await verifyPassword(u.passwordHash, password))) throw unauthorized("Incorrect password");
    }
    await store.revokeAllRefreshTokens(u.id);
    await onDelete?.(u.id).catch(() => {});          // e.g. remove the chat history and its pictures
    await store.anonymiseUser(u.id);
    return reply.status(204).send();
  };
  app.delete("/me", pre, deleteAccount);
  app.post("/me/delete", pre, deleteAccount);

  app.get("/me/addresses", pre, async (req) => ({ items: await store.listAddresses(req.user!.id) }));
  app.post("/me/addresses", pre, async (req, reply) => {
    const a = norm(addr.parse(req.body));
    return reply.status(201).send(await store.createAddress(req.user!.id, a));
  });
  app.patch<{ Params: { id: string } }>("/me/addresses/:id", pre, async (req) => {
    const id = z.string().uuid().parse(req.params.id);
    const a = await store.updateAddress(req.user!.id, id, addr.partial().parse(req.body) as never);
    if (!a) throw notFound("Address not found");
    return a;
  });
  app.delete<{ Params: { id: string } }>("/me/addresses/:id", pre, async (req, reply) => {
    const id = z.string().uuid().parse(req.params.id);
    if (!(await store.deleteAddress(req.user!.id, id))) throw notFound("Address not found");
    return reply.status(204).send();
  });
}
