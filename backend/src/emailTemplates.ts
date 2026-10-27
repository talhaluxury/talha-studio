import { STATUS_LABEL, type OrderStatus } from "./orderStatus.js";
import type { OrderRec } from "./orderStore.js";
import type { StoreSettings, TemplateKey } from "./settingsStore.js";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const pkr = (n: number) => "Rs. " + n.toLocaleString("en-PK");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();      // blocks header injection through subjects
const fmtDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz }).format(d);

export interface Brand { storeName: string; logoUrl: string; adminUrl: string; timezone: string }
export interface Rendered { subject: string; html: string; text: string }

/** Only these placeholders exist; unknown ones are left as typed. Values are escaped by the caller's context. */
export function fill(tpl: string, vars: Record<string, string>) { return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k]! : m)); }
const varsFor = (o: OrderRec) => ({ orderNumber: o.orderNumber, customerName: o.customer.name, status: STATUS_LABEL[o.status], total: pkr(o.total) });

const C = { black: "#080808", ivory: "#FAF8F3", gold: "#B99A62", neutral: "#E9E0D3", gray: "#77736D" };

function shell(brand: Brand, bodyHtml: string, preheader: string) {
  const mark = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.storeName)}" width="64" height="64" style="display:block;margin:0 auto 8px;border-radius:14px">`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${C.ivory};font-family:Helvetica,Arial,sans-serif;color:${C.black}">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${C.neutral};border-radius:14px;overflow:hidden">
<tr><td align="center" style="background:${C.black};padding:24px 16px">${mark}<div style="font-family:Georgia,serif;letter-spacing:6px;color:${C.ivory};font-size:22px">TALHA</div><div style="letter-spacing:6px;color:${C.gold};font-size:10px;margin-top:2px">STUDIO</div></td></tr>
<tr><td style="padding:28px 28px 8px">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(o: OrderRec) {
  const rows = o.items.map((i) => {
    const opt = [i.color, i.size ? `Size ${i.size}` : ""].filter(Boolean).join(" · ");
    return `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.neutral}"><b>${esc(i.name)}</b>${opt ? `<br><span style="color:${C.gray};font-size:12px">${esc(opt)}</span>` : ""}<br><span style="color:${C.gray};font-size:12px">Qty ${i.qty} × ${esc(pkr(i.unitPrice))}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid ${C.neutral};white-space:nowrap">${esc(pkr(i.unitPrice * i.qty))}</td></tr>`;
  }).join("");
  const line = (l: string, v: string, bold = false) => `<tr><td style="padding:3px 0;${bold ? "font-weight:bold;font-size:16px;" : `color:${C.gray};`}">${l}</td><td align="right" style="padding:3px 0;${bold ? "font-weight:bold;font-size:16px;" : ""}">${esc(v)}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
${line("Subtotal", pkr(o.subtotal))}${o.discount ? line("Discount", "- " + pkr(o.discount)) : ""}${line("Delivery", o.shipping ? pkr(o.shipping) : "Free")}${line("Total", pkr(o.total), true)}</table>`;
}
const itemsText = (o: OrderRec) => o.items.map((i) => `- ${i.qty} x ${i.name}${[i.color, i.size ? `Size ${i.size}` : ""].filter(Boolean).length ? ` (${[i.color, i.size ? `Size ${i.size}` : ""].filter(Boolean).join(", ")})` : ""}: ${pkr(i.unitPrice * i.qty)}`).join("\n");
const addressLines = (o: OrderRec) => [o.customer.name, o.address.line1, o.address.line2, [o.address.city, o.address.province, o.address.postalCode].filter(Boolean).join(", "), o.customer.phone].filter(Boolean) as string[];
const para = (t: string) => (t.trim() ? `<p style="margin:0 0 16px;line-height:1.6">${esc(t)}</p>` : "");
const h = (t: string) => `<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 12px">${esc(t)}</h2>`;
const sec = (title: string, inner: string) => `<div style="margin:20px 0 6px;color:${C.gray};font-size:11px;letter-spacing:1px">${esc(title)}</div>${inner}`;
const contactBlock = (s: StoreSettings) => {
  const l = [s.store.supportEmail && `Email: ${s.store.supportEmail}`, s.store.supportPhone && `Phone: ${s.store.supportPhone}`, s.store.address].filter(Boolean) as string[];
  return l;
};
const footerHtml = (s: StoreSettings, footer: string) => {
  const c = contactBlock(s);
  return `<div style="border-top:1px solid ${C.neutral};margin-top:24px;padding:16px 0 24px;color:${C.gray};font-size:12px;line-height:1.6">${footer.trim() ? `<div style="margin-bottom:8px">${esc(footer)}</div>` : ""}${c.length ? c.map(esc).join("<br>") : ""}<div style="margin-top:8px">${esc(s.store.name)}</div></div>`;
};

function customerEmail(kind: Extract<TemplateKey, "order_confirmation" | "status_update">, o: OrderRec, s: StoreSettings, b: Brand, headline: string): Rendered {
  const t = s.templates[kind]; const v = varsFor(o);
  const subject = oneLine(fill(t.subject, v)); const intro = fill(t.intro, v); const footer = fill(t.footer, v);
  const est = s.estimatedDelivery.trim();
  const track = o.trackingUrl ? sec("TRACK YOUR PARCEL", `<p style="margin:0 0 8px"><a href="${esc(o.trackingUrl)}" style="color:${C.black};font-weight:bold">${esc(o.trackingUrl)}</a></p>`) : "";
  const html = shell(b, `${h(headline)}${para(intro)}
<div style="background:${C.ivory};border-radius:10px;padding:12px 16px;margin-bottom:8px"><b>Order ${esc(o.orderNumber)}</b><br><span style="color:${C.gray};font-size:12px">${esc(fmtDate(o.createdAt, b.timezone))} · Status: ${esc(STATUS_LABEL[o.status])}</span></div>
${sec("YOUR ITEMS", itemsTable(o))}${sec("DELIVERY ADDRESS", `<p style="margin:0;line-height:1.6">${addressLines(o).map(esc).join("<br>")}</p>`)}
${sec("PAYMENT", `<p style="margin:0">${o.paymentMethod === "cod" ? "Cash on Delivery" : esc(o.paymentMethod)} (${esc(o.paymentStatus)})</p>`)}
${est ? sec("ESTIMATED DELIVERY", `<p style="margin:0">${esc(est)}</p>`) : ""}${track}${footerHtml(s, footer)}`, intro);
  const text = [headline, "", intro, "", `Order ${o.orderNumber} - ${fmtDate(o.createdAt, b.timezone)} - Status: ${STATUS_LABEL[o.status]}`, "", itemsText(o), "",
    `Subtotal: ${pkr(o.subtotal)}`, ...(o.discount ? [`Discount: -${pkr(o.discount)}`] : []), `Delivery: ${o.shipping ? pkr(o.shipping) : "Free"}`, `Total: ${pkr(o.total)}`, "",
    "Delivery address:", ...addressLines(o), "", `Payment: ${o.paymentMethod === "cod" ? "Cash on Delivery" : o.paymentMethod} (${o.paymentStatus})`,
    ...(est ? ["", `Estimated delivery: ${est}`] : []), ...(o.trackingUrl ? ["", `Track your parcel: ${o.trackingUrl}`] : []), "", footer, ...contactBlock(s), s.store.name].filter((x) => x !== undefined).join("\n");
  return { subject, html, text };
}

export const renderOrderConfirmation = (o: OrderRec, s: StoreSettings, b: Brand) => customerEmail("order_confirmation", o, s, b, "Thank you for your order");

const STATUS_HEADLINE: Partial<Record<OrderStatus, string>> = {
  confirmed: "Your order is confirmed", processing: "We are preparing your order", shipped: "Your order is on its way", delivered: "Your order was delivered",
  cancelled: "Your order was cancelled", refund_requested: "We received your return request", refunded: "Your refund was processed",
};
export const renderStatusUpdate = (o: OrderRec, s: StoreSettings, b: Brand) => customerEmail("status_update", o, s, b, STATUS_HEADLINE[o.status] ?? "Your order was updated");

export function renderOwnerNewOrder(o: OrderRec, s: StoreSettings, b: Brand, alert?: { headline: string }): Rendered {
  const t = s.templates.owner_new_order; const v = varsFor(o);
  const headline = alert?.headline ?? "New order received";
  const subject = oneLine(alert ? `${alert.headline}: ${o.orderNumber}` : fill(t.subject, v)); const intro = alert ? `Order ${o.orderNumber} needs your attention.` : fill(t.intro, v);
  const link = b.adminUrl ? `${b.adminUrl.replace(/\/$/, "")}/#/orders/${o.id}` : "";
  const html = shell(b, `${h(headline)}${para(intro)}
<div style="background:${C.ivory};border-radius:10px;padding:12px 16px"><b>${esc(o.orderNumber)}</b> · <b>${esc(pkr(o.total))}</b><br><span style="color:${C.gray};font-size:12px">${esc(fmtDate(o.createdAt, b.timezone))} · ${esc(STATUS_LABEL[o.status])}</span></div>
${sec("CUSTOMER", `<p style="margin:0;line-height:1.6">${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.email)}</p>`)}
${sec("DELIVERY ADDRESS", `<p style="margin:0;line-height:1.6">${addressLines(o).slice(1, -1).map(esc).join("<br>")}</p>`)}
${o.notes ? sec("CUSTOMER NOTE", `<p style="margin:0">${esc(o.notes)}</p>`) : ""}
${sec("ITEMS", itemsTable(o))}
${sec("PAYMENT", `<p style="margin:0">${o.paymentMethod === "cod" ? "Cash on Delivery" : esc(o.paymentMethod)} · ${esc(o.paymentStatus)} · Total ${esc(pkr(o.total))}</p>`)}
${link ? `<p style="margin:24px 0"><a href="${esc(link)}" style="background:${C.gold};color:${C.black};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Open order in admin</a></p>` : ""}
<div style="height:16px"></div>`, intro);
  const text = [headline, intro, "", `${o.orderNumber} - ${pkr(o.total)} - ${fmtDate(o.createdAt, b.timezone)}`, "", "Customer:", o.customer.name, o.customer.phone, o.customer.email, "",
    "Delivery address:", ...addressLines(o).slice(1, -1), ...(o.notes ? ["", `Customer note: ${o.notes}`] : []), "", "Items:", itemsText(o), "",
    `Payment: ${o.paymentMethod === "cod" ? "Cash on Delivery" : o.paymentMethod} (${o.paymentStatus})`, `Total: ${pkr(o.total)}`, ...(link ? ["", `Open in admin: ${link}`] : [])].join("\n");
  return { subject, html, text };
}

export function renderTest(s: StoreSettings, b: Brand): Rendered {
  const html = shell(b, `${h("Test email")}${para("If you can read this, your email provider is set up correctly and the store can send order emails.")}${footerHtml(s, "")}`, "Test email from your store");
  return { subject: `${b.storeName} test email`, html, text: "Test email: your email provider is set up correctly." };
}
