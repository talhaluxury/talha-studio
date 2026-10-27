import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { OAuth2Client } from "google-auth-library";
import type { Config } from "./config.js";
import { installErrorHandler } from "./errors.js";
import { makeAuth } from "./plugins/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes, type GoogleVerifier } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import multipart from "@fastify/multipart";
import { createReadStream } from "node:fs";
import type { CatalogStore } from "./catalogStore.js";
import { MAX_UPLOAD_BYTES, sharpProcessor, type ImageProcessor } from "./images.js";
import { adminCatalogRoutes } from "./routes/adminCatalog.js";
import { catalogRoutes } from "./routes/catalog.js";
import { LocalStorage, type Storage } from "./storage.js";
import type { Store } from "./store.js";
import type { OrderStore } from "./orderStore.js";
import type { CouponStore } from "./couponStore.js";
import type { BannerStore } from "./bannerStore.js";
import { adminCommerceRoutes } from "./routes/adminCommerce.js";
import { infoRoutes, legalRoutes } from "./routes/info.js";
import type { PushService } from "./pushService.js";
import type { PushStore } from "./pushStore.js";
import { pushRoutes } from "./routes/push.js";
import { composeEvents } from "./events.js";
import type { EmailService } from "./emailService.js";
import type { EmailStore } from "./emailStore.js";
import type { SettingsStore } from "./settingsStore.js";
import { adminEmailRoutes } from "./routes/adminEmail.js";
import type { OrderEvents } from "./events.js";
import { orderRoutes } from "./routes/orders.js";
import { adminOrderRoutes } from "./routes/adminOrders.js";

export interface Deps { coupons: CouponStore; banners: BannerStore; push: PushService; pushStore: PushStore; email: EmailService; emails: EmailStore; settings: SettingsStore; store: Store; catalog: CatalogStore; orders: OrderStore; events?: OrderEvents; storage: Storage; images?: ImageProcessor; google?: GoogleVerifier }

export function googleVerifier(clientId: string): GoogleVerifier {
  const client = new OAuth2Client(clientId);
  return {
    async verify(idToken) {
      if (!clientId) throw new Error("GOOGLE_WEB_CLIENT_ID not configured");
      const t = await client.verifyIdToken({ idToken, audience: clientId });
      const p = t.getPayload();
      if (!p?.sub || !p.email) throw new Error("bad payload");
      return { sub: p.sub, email: p.email, emailVerified: !!p.email_verified, name: p.name ?? "" };
    },
  };
}

export async function buildApp(cfg: Config, deps: Deps) {
  const { store, catalog, storage, orders } = deps;
  const events = deps.events ?? composeEvents(deps.email, deps.push);       // order emails + push are the default side effects of order events
  const images = deps.images ?? sharpProcessor;
  const google = deps.google ?? googleVerifier(cfg.GOOGLE_WEB_CLIENT_ID);
  const app = Fastify({
    logger: cfg.NODE_ENV === "test" ? false : { level: "info", redact: ["req.headers.authorization", "req.headers.cookie"] },
    trustProxy: cfg.TRUST_PROXY_HOPS,   // number of reverse proxies in front; a spoofed X-Forwarded-For beyond that is ignored (matters for rate limits)
    bodyLimit: 256 * 1024,
  });
  installErrorHandler(app);
  // Authenticated and account responses must never be cached by browsers or proxies.
  app.addHook("onSend", async (req, reply) => { if (/^\/v1\/(me|admin|auth|orders|cart)/.test(req.url)) reply.header("cache-control", "no-store"); });
  await app.register(helmet);
  await app.register(cors, { origin: cfg.ADMIN_ORIGIN ? cfg.ADMIN_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean) : false, methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  // Dev-only media server (production uses object storage + CDN URLs).
  if (storage instanceof LocalStorage) {
    app.get<{ Params: { "*": string } }>("/media/*", async (req, reply) => {
      let path: string; try { path = storage.resolvePath(req.params["*"]); } catch { return reply.status(404).send(); }
      if (!(await storage.exists(req.params["*"]))) return reply.status(404).send();
      return reply.header("content-type", "image/webp").header("cache-control", "public, max-age=3600").header("cross-origin-resource-policy", "cross-origin").send(createReadStream(path));
    });
  }

  app.get("/healthz", async () => { await store.ping(); return { ok: true }; });

  legalRoutes(app, { settings: deps.settings });          // public policy pages, e.g. https://api.example.com/legal/privacy
  const auth = makeAuth(store, cfg.JWT_ACCESS_SECRET);
  await app.register(async (v1) => {
    authRoutes(v1, { store, secret: cfg.JWT_ACCESS_SECRET, google });
    meRoutes(v1, { store, auth });
    adminRoutes(v1, { store, auth });
    catalogRoutes(v1, { catalog, storage, cfg, settings: deps.settings, banners: deps.banners, coupons: deps.coupons });
    orderRoutes(v1, { orders, storage, auth, cfg, settings: deps.settings, events });
    adminOrderRoutes(v1, { orders, store, storage, auth, cfg, events });
    adminCommerceRoutes(v1, { coupons: deps.coupons, banners: deps.banners, settings: deps.settings, storage, images, store, auth });
    infoRoutes(v1, { settings: deps.settings, returnWindowDays: cfg.RETURN_WINDOW_DAYS, store, orders, push: deps.pushStore, auth });
    pushRoutes(v1, { store, push: deps.pushStore, svc: deps.push, auth });
    adminEmailRoutes(v1, { cfg, email: deps.email, emails: deps.emails, settings: deps.settings, store, auth });
    adminCatalogRoutes(v1, { catalog, storage, images, auth, log: (e) => store.logActivity(e) });
  }, { prefix: "/v1" });
  return app;
}
