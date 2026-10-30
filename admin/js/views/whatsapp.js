import { api } from "../api.js";
import { clear, fmtDate, h, put } from "../ui.js";

const KIND = { welcome: "Welcome (new account)", order_confirmation: "Order confirmation" };
const STATE = { sent: "ok", failed: "bad", skipped: "", sending: "" };

/* Read-only log of WhatsApp messages the server tried to send, so the owner can see why one failed. */
export async function renderWhatsapp(view) {
  const { configured, items } = await api("/admin/whatsapp");
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "WhatsApp messages"),
    h("p", { class: "muted" }, "A welcome message goes to everyone who creates an account with a number, and a confirmation to every customer who places an order."))),
    configured ? null : h("div", { class: "card" }, h("b", {}, "WhatsApp is switched off."), h("p", { class: "muted" }, "Set WHATSAPP_DRIVER=cloud, WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server. Nothing is sent until then.")),
    items.length ? h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["When", "Message", "To", "Result"].map((t) => h("th", {}, t)))),
      h("tbody", {}, items.map((m) => h("tr", {}, h("td", {}, fmtDate(m.createdAt)), h("td", {}, KIND[m.kind] ?? m.kind), h("td", {}, `+${m.to}`),
        h("td", {}, h("span", { class: `badge ${STATE[m.status] ?? ""}` }, m.status), m.error ? h("div", { class: "hint" }, m.error) : null))))))
      : h("div", { class: "empty" }, h("h2", {}, "No messages yet")));
}
