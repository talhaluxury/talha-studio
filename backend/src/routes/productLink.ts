import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CatalogStore } from "../catalogStore.js";
import type { Storage } from "../storage.js";
import { toApiProduct } from "./catalog.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const APP_PACKAGE = "com.talhastudiopk.app";

/**
 * The address printed in the product QR code: https://<api>/p/<product id>.
 * It shows the product and a big button that opens it in the Talha Studio app (Android intent link, with the plain app link as a second button).
 */
export function productLinkRoutes(app: FastifyInstance, d: { catalog: CatalogStore; storage: Storage; storeName: string }) {
  app.get<{ Params: { id: string } }>("/p/:id", async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const p = id.success ? await d.catalog.getProduct(id.data, true) : null;
    const nonce = randomBytes(12).toString("base64");
    const api = p ? toApiProduct(p, d.storage) : null;
    const web = `talhastudio://product/${id.success ? id.data : ""}`;
    const intent = `intent://product/${id.success ? id.data : ""}#Intent;scheme=talhastudio;package=${APP_PACKAGE};end`;
    const price = api ? `Rs. ${(api.salePrice ?? api.price).toLocaleString("en-US")}` : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p?.name ?? d.storeName)}</title>
<style nonce="${nonce}">
body{margin:0;background:#080808;color:#faf8f3;font-family:Georgia,serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{width:min(92vw,420px);text-align:center;padding:24px}
.brand{letter-spacing:.35em;color:#b99a62;font-size:13px;margin-bottom:18px}
img{width:100%;max-height:52vh;object-fit:cover;border-radius:22px;border:1px solid #b99a6255}
h1{font-size:22px;font-weight:500;margin:18px 0 6px}.p{color:#b99a62;font-size:20px;margin-bottom:22px}
a.b{display:block;padding:16px;border-radius:14px;background:#b99a62;color:#080808;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600;margin-top:10px}
a.o{background:transparent;color:#b99a62;border:1px solid #b99a62}
small{display:block;color:#faf8f399;margin-top:18px;font-family:system-ui,sans-serif}
</style></head><body><div class="c"><div class="brand">${esc(d.storeName.toUpperCase())}</div>
${api?.images[0] ? `<img src="${esc(api.images[0].url)}" alt="">` : ""}
<h1>${esc(p?.name ?? "This product is not available")}</h1><div class="p">${esc(price)}</div>
<a class="b" href="${esc(intent)}">Open in the app</a><a class="b o" href="${esc(web)}">Open (other phones)</a>
<small>Install the ${esc(d.storeName)} app to see sizes, colours and order this suit.</small></div>
<script nonce="${nonce}">setTimeout(function(){location.href=${JSON.stringify(intent)}},400)</script></body></html>`;
    return reply.status(p ? 200 : 404).header("content-type", "text/html; charset=utf-8").header("cache-control", "no-store")
      .header("content-security-policy", `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src https: data:; base-uri 'none'; form-action 'none'`).send(html);
  });
}
