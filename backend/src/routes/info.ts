import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { esc } from "../emailTemplates.js";
import { notFound } from "../errors.js";
import type { OrderStore } from "../orderStore.js";
import type { makeAuth } from "../plugins/auth.js";
import { PAGE_SLUGS, PAGE_TITLES, type PageSlug } from "../policyDefaults.js";
import type { PushStore } from "../pushStore.js";
import type { SettingsStore, StoreSettings } from "../settingsStore.js";
import type { Store } from "../store.js";

const slug = z.enum(PAGE_SLUGS as [PageSlug, ...PageSlug[]]);

/** Plain text -> safe HTML: "# x" is a heading, blank lines separate paragraphs. Everything is escaped. */
export function renderPageBody(text: string): string {
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.trim().split("\n"); const out: string[] = [];
    for (const line of lines) out.push(line.startsWith("# ") ? `<h2>${esc(line.slice(2))}</h2>` : `<p>${esc(line)}</p>`);
    return out.join("");
  }).join("\n");
}
const contactLines = (s: StoreSettings) => [s.store.name, s.store.supportEmail && `Email: ${s.store.supportEmail}`, s.store.supportPhone && `Phone: ${s.store.supportPhone}`, s.store.address].filter(Boolean) as string[];

export function infoRoutes(app: FastifyInstance, d: { settings: SettingsStore; returnWindowDays: number; store: Store; orders: OrderStore; push: PushStore; auth: ReturnType<typeof makeAuth> }) {
  const { settings, store, orders, push, auth } = d;

  app.get("/store-info", async () => {
    const s = await settings.load();
    return { name: s.store.name, supportEmail: s.store.supportEmail || null, supportPhone: s.store.supportPhone || null, address: s.store.address || null,
      estimatedDelivery: s.estimatedDelivery || null, shipping: s.shipping, returnWindowDays: d.returnWindowDays,
      pages: PAGE_SLUGS.map((x) => ({ slug: x, title: PAGE_TITLES[x] })) };
  });
  app.get<{ Params: { slug: string } }>("/pages/:slug", async (req) => {
    const sl = slug.safeParse(req.params.slug); if (!sl.success) throw notFound("Page not found");
    const s = await settings.load(); return { slug: sl.data, title: PAGE_TITLES[sl.data], body: s.pages[sl.data], contact: contactLines(s) };
  });

  // Privacy export: everything we hold about the signed-in customer.
  app.get("/me/export", { preHandler: auth.customer, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const u = req.user!;
    const [addresses, ords, prefs] = await Promise.all([store.listAddresses(u.id), orders.exportForUser(u.id), push.getPrefs(u.id)]);
    const data = {
      exportedAt: new Date().toISOString(),
      profile: { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, createdAt: u.createdAt, signInMethods: [u.passwordHash ? "password" : null, u.googleSub ? "google" : null].filter(Boolean) },
      addresses: addresses.map(({ id: _i, userId: _u, ...a }) => a), notificationPreferences: prefs,
      orders: ords.map((o) => ({ orderNumber: o.orderNumber, placedAt: o.createdAt, status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total,
        couponCode: o.couponCode, customer: o.customer, address: o.address, notes: o.notes, items: o.items.map((i) => ({ name: i.name, sku: i.sku, size: i.size, color: i.color, unitPrice: i.unitPrice, qty: i.qty })), history: o.history })),
    };
    return reply.header("content-disposition", 'attachment; filename="talha-studio-my-data.json"').send(data);
  });
}

/** Public, human-readable policy pages (e.g. the Privacy Policy URL you give Google Play): GET /legal/privacy */
export function legalRoutes(app: FastifyInstance, d: { settings: SettingsStore }) {
  const settings = d.settings;
  // Google Play requires a public web page explaining how to request account and data deletion.
  app.get("/legal/account-deletion", async (_req, reply) => {
    const s = await settings.load(); const mail = s.store.supportEmail;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Delete your account · ${esc(s.store.name)}</title>
<style>body{margin:0;background:#FAF8F3;color:#080808;font:16px/1.65 Georgia,serif}main{max-width:720px;margin:0 auto;padding:32px 20px 64px}h1,h2{font-weight:500}p,li{margin:8px 0}footer{margin-top:40px;padding-top:16px;border-top:1px solid #E9E0D3;color:#77736D;font:14px/1.6 system-ui,sans-serif}</style></head>
<body><main><h1>Delete your ${esc(s.store.name)} account</h1>
<h2>In the app</h2><ol><li>Open the app and sign in.</li><li>Go to Profile, then Settings.</li><li>Choose <b>Delete my account</b> and confirm.</li></ol>
<p>Your account is deleted immediately.</p>
<h2>Cannot use the app?</h2><p>${mail ? `Email us at <b>${esc(mail)}</b> from the address you registered with and ask us to delete your account. We will confirm within 7 days.` : "Contact the store using the details below and ask us to delete your account."}</p>
<h2>What is deleted</h2><p>Your name, email, phone number, password, sign-in link to Google, saved addresses, notification preferences, notifications and device tokens.</p>
<h2>What we keep</h2><p>Order records (items, amounts, delivery details of past orders) are kept for accounting and legal reasons, and are no longer linked to a profile after deletion.</p>
<footer>${contactLines(s).map(esc).join("<br>")}</footer></main></body></html>`;
    return reply.header("cache-control", "public, max-age=300").type("text/html; charset=utf-8").send(html);
  });
  app.get<{ Params: { slug: string } }>("/legal/:slug", async (req, reply) => {
    const sl = slug.safeParse(req.params.slug); if (!sl.success) return reply.status(404).type("text/plain").send("Page not found");
    const s = await settings.load(); const title = `${PAGE_TITLES[sl.data]} · ${s.store.name}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#FAF8F3;color:#080808;font:16px/1.65 Georgia,serif}main{max-width:720px;margin:0 auto;padding:32px 20px 64px}h1{font-weight:500}h2{font-weight:500;margin-top:28px}p{margin:10px 0}footer{margin-top:40px;padding-top:16px;border-top:1px solid #E9E0D3;color:#77736D;font:14px/1.6 system-ui,sans-serif}</style></head>
<body><main><h1>${esc(PAGE_TITLES[sl.data])}</h1>${renderPageBody(s.pages[sl.data])}<footer>${contactLines(s).map(esc).join("<br>")}</footer></main></body></html>`;
    return reply.header("cache-control", "public, max-age=300").type("text/html; charset=utf-8").send(html);
  });
}
