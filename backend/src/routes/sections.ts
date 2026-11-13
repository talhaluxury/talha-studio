import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../errors.js";
import type { Store } from "../store.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SectionStore } from "../sectionStore.js";
import type { SettingsStore } from "../settingsStore.js";

const idParam = z.string().uuid();
const body = z.object({ title: z.string().trim().min(2).max(40), sortOrder: z.number().int().min(0).max(9999).default(0), isActive: z.boolean().default(true) });
const productsBody = z.object({ productIds: z.array(z.string().uuid()).max(50) });

/** Owner-made home sections: a title plus hand-picked products, shown on the home screen after the built-in ones. */
export function sectionRoutes(app: FastifyInstance, d: { sections: SectionStore; settings: SettingsStore; store: Store; auth: ReturnType<typeof makeAuth> }) {
  const { sections, settings, store, auth } = d;
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };
  const log = (req: any, action: string, id?: string) => store.logActivity({ adminId: req.user.id, action, entity: "section", entityId: id, ip: req.ip });

  // How each home section is laid out in the app: "slider" (swipe sideways) or "grid" (products scroll down with the page). Missing = slider.
  app.get("/admin/home-layouts", manager, async () => ({ layouts: (await settings.load()).homeLayouts }));
  app.put("/admin/home-layouts", manager, async (req) => {
    const b = z.object({ layouts: z.record(z.string().max(60), z.enum(["slider", "grid"])) }).refine((v) => Object.keys(v.layouts).length <= 60).parse(req.body);
    const s = await settings.load(); s.homeLayouts = b.layouts; await settings.save(s); await log(req, "section.layout"); return { layouts: s.homeLayouts };
  });
  app.get("/admin/sections", manager, async () => ({ items: await sections.list(false) }));
  app.post("/admin/sections", manager, async (req, reply) => {
    const b = body.parse(req.body); const s = await sections.create(b.title, b.sortOrder); await log(req, "section.create", s.id); return reply.status(201).send(s);
  });
  app.put<{ Params: { id: string } }>("/admin/sections/:id", manager, async (req) => {
    const id = idParam.parse(req.params.id); const b = body.parse(req.body);
    const s = await sections.update(id, b); if (!s) throw notFound("Section not found"); await log(req, "section.update", id); return s;
  });
  app.put<{ Params: { id: string } }>("/admin/sections/:id/products", manager, async (req) => {
    const id = idParam.parse(req.params.id); const b = productsBody.parse(req.body);
    const s = await sections.setProducts(id, b.productIds); if (!s) throw notFound("Section not found"); await log(req, "section.products", id); return s;
  });
  app.delete<{ Params: { id: string } }>("/admin/sections/:id", manager, async (req, reply) => {
    const id = idParam.parse(req.params.id); if (!(await sections.remove(id))) throw notFound("Section not found"); await log(req, "section.delete", id); return reply.status(204).send();
  });
}
