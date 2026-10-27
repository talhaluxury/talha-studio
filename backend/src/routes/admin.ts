import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { conflict, notFound } from "../errors.js";
import { hashPassword } from "../security.js";
import type { Store } from "../store.js";
import { publicUser } from "./auth.js";

export function adminRoutes(app: FastifyInstance, d: { store: Store; auth: ReturnType<typeof import("../plugins/auth.js").makeAuth> }) {
  const { store, auth } = d;
  const staff = { preHandler: [auth.admin] };
  const ownerOnly = { preHandler: [auth.admin, auth.requireRole("owner")] };

  app.get("/admin/me", staff, async (req) => ({ user: publicUser(req.user!) }));

  // Owner manages team accounts and roles. Role is only ever set server-side by an owner.
  app.get("/admin/users", ownerOnly, async () => ({ items: (await store.listUsersByRoles(["staff", "admin", "owner"])).map(publicUser) }));

  app.post("/admin/users", ownerOnly, async (req, reply) => {
    const b = z.object({
      fullName: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email(),
      password: z.string().min(10).max(128), role: z.enum(["staff", "admin"]),
    }).parse(req.body);
    if (await store.findUserByEmail(b.email)) throw conflict("Email already in use");
    const u = await store.createUser({ email: b.email, passwordHash: await hashPassword(b.password), googleSub: null, fullName: b.fullName, phone: null, role: b.role });
    await store.logActivity({ adminId: req.user!.id, action: "user.create", entity: "user", entityId: u.id, meta: { role: b.role }, ip: req.ip });
    return reply.status(201).send({ user: publicUser(u) });
  });

  app.patch<{ Params: { id: string } }>("/admin/users/:id", ownerOnly, async (req) => {
    const id = z.string().uuid().parse(req.params.id);
    const b = z.object({ role: z.enum(["staff", "admin"]).optional(), isActive: z.boolean().optional() }).parse(req.body);
    const target = await store.findUserById(id);
    if (!target || target.role === "customer") throw notFound("User not found");
    if (target.role === "owner") throw conflict("The owner account cannot be modified here");
    const u = await store.updateUser(id, b);
    await store.logActivity({ adminId: req.user!.id, action: "user.update", entity: "user", entityId: id, meta: b, ip: req.ip });
    return { user: publicUser(u) };
  });
}
