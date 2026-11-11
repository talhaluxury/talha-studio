import { api } from "./api.js";
import { h, money, toast } from "./ui.js";

/** Product QR label: scanning the printed QR opens the product in the customer app. Print it (browser) or share/save it (Android admin app). */
const bridge = () => { try { return window.TalhaWA && window.TalhaWA.available() ? window.TalhaWA : null; } catch { return null; } };

const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** A ready-to-print picture of the label (brand, QR, name, price) so it can be shared or saved as one image. */
async function labelPng(q) {
  const c = document.createElement("canvas"); c.width = 800; c.height = 1000; const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 800, 1000);
  g.fillStyle = "#b99a62"; g.font = "600 34px Georgia, serif"; g.textAlign = "center"; g.fillText("T A L H A   S T U D I O", 400, 90);
  g.drawImage(await loadImg(q.png), 80, 130, 640, 640);
  g.fillStyle = "#080808"; g.font = "600 44px Georgia, serif";
  const name = q.name.length > 28 ? q.name.slice(0, 27) + "…" : q.name; g.fillText(name, 400, 845);
  g.fillStyle = "#555"; g.font = "34px system-ui, sans-serif"; g.fillText(`${q.sku}  ·  ${money(q.salePrice ?? q.price)}`, 400, 905);
  g.fillStyle = "#b99a62"; g.font = "28px system-ui, sans-serif"; g.fillText("Scan to open in the app", 400, 960);
  return c.toDataURL("image/png");
}

async function shareOrSave(q) {
  const png = await labelPng(q); const N = bridge();
  if (N) { N.shareImage(png, q.name); return; }
  const a = h("a", { href: png, download: `qr-${q.sku}.png` }); document.body.append(a); a.click(); a.remove();
}

function labelBox(q) {
  return h("div", { class: "qrlabel" },
    h("div", { class: "qrbrand" }, "TALHA STUDIO"),
    h("img", { src: q.png, alt: `QR code for ${q.name}` }),
    h("div", { class: "qrname" }, q.name),
    h("div", { class: "qrsub" }, `${q.sku} · ${money(q.salePrice ?? q.price)}`),
    h("div", { class: "qrhint" }, "Scan to open in the app"));
}

/** Prints just the label: it is shown alone in a dialog (the print style hides everything else), printed, then removed. */
function printLabel(q) {
  const dlg = h("dialog", { class: "dialog qrdialog" }, labelBox(q));
  const done = () => { dlg.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  document.body.append(dlg); dlg.showModal();
  setTimeout(() => window.print(), 150);
}

function buttons(q, extra) {
  return h("div", { class: "row end qractions" }, extra,
    bridge() ? null : h("button", { class: "btn gold", type: "button", onclick: () => printLabel(q) }, "Print label"),
    h("button", { class: "btn", type: "button", onclick: () => shareOrSave(q).catch((e) => toast(e.message || "Could not save the QR code", "error")) }, bridge() ? "Share / save QR" : "Download QR"));
}

/** Card for the product page: the QR is made automatically as soon as the product exists. */
export function qrCard(productId) {
  const card = h("div", { class: "card qrcard" }, h("h2", {}, "QR code for the suit"), h("p", { class: "hint" }, "Print it and attach it to the suit or the parcel. When a customer scans it, this product opens in the Talha Studio app."));
  const body = h("div", {}, h("p", { class: "muted" }, "Making the QR code..."));
  card.append(body);
  api(`/admin/products/${productId}/qr`).then((q) => { body.replaceChildren(labelBox(q), buttons(q)); }).catch((e) => { body.replaceChildren(h("p", { class: "err" }, e.message)); });
  return card;
}

/** Popup used from the product list. */
export async function openQrLabel(productId) {
  let q; try { q = await api(`/admin/products/${productId}/qr`); } catch (e) { toast(e.message, "error"); return; }
  const dlg = h("dialog", { class: "dialog qrdialog" }, h("h2", {}, "Product QR code"), labelBox(q), buttons(q, h("button", { class: "btn ghost", type: "button", onclick: () => dlg.close() }, "Close")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
}
