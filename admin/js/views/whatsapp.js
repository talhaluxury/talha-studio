import { api } from "../api.js";
import { clear, fmtDate, h, put, toast, confirmDialog } from "../ui.js";

const KIND = { welcome: "Welcome (new account)", order_confirmation: "Order confirmation", new_arrival: "New product", reply: "Reply to customer" };
const STATE = { sent: "ok", failed: "bad", skipped: "", sending: "" };

/* "Tell customers about a product": one WhatsApp message per customer with a number (those who replied STOP are skipped). */
async function broadcastCard(configured) {
  let products = [];
  try { products = (await api("/admin/products?page=1&limit=50")).items.filter((p) => p.isPublished); } catch { /* the log below still works */ }
  const pick = h("select", { "aria-label": "Product" }, products.map((p) => h("option", { value: p.id }, p.name)));
  const btn = h("button", { class: "btn gold", disabled: !configured || !products.length, onclick: async () => {
    const p = products.find((x) => x.id === pick.value); if (!p) return;
    if (!(await confirmDialog("Message all customers?", `Send "${p.name}" on WhatsApp to every customer with a phone number? Each customer gets it once.`, "Send"))) return;
    try { const r = await api("/admin/whatsapp/broadcast", { method: "POST", body: { productId: p.id } }); toast(`Sending to ${r.queued} customers. Refresh in a minute to see the results.`); }
    catch (e) { toast(e.message, "error"); }
  } }, "Send to customers");
  return h("div", { class: "card" }, h("b", {}, "Tell customers about a product"),
    h("p", { class: "muted" }, "Sent slowly, one customer at a time, so your number stays safe. Customers who reply STOP are skipped."), h("div", { class: "row" }, pick, btn));
}


/* QR login (WHATSAPP_DRIVER=qr): scan with WhatsApp > Linked devices > Link a device. The server keeps the session, so this is needed once. */
const QR_TEXT = { starting: "Starting WhatsApp, please wait...", connecting: "Connecting...", logged_out: "Logged out. A new QR code will appear in a moment.", qr: "Scan this QR code with the WhatsApp on your phone" };
function connectCard(view) {
  const body = h("div", {});
  const phone = h("input", { type: "tel", placeholder: "03001234567", "aria-label": "Your WhatsApp number" });
  const code = h("div", { style: "font-size:28px;letter-spacing:4px;font-weight:700;margin-top:8px" });
  const getCode = h("button", { class: "btn gold", onclick: async () => {
    try { const r = await api("/admin/whatsapp/qr/pair", { method: "POST", body: { phone: phone.value } }); code.textContent = r.code; toast("Code ready: type it in WhatsApp"); }
    catch (e) { toast(e.message, "error"); }
  } }, "Get code");
  const pair = h("div", { style: "margin-top:16px" }, h("b", {}, "Admin is open on the same phone?"),
    h("p", { class: "hint" }, "Enter your WhatsApp number to get a code. Then in WhatsApp: Settings > Linked devices > Link a device > Link with phone number instead, and type the code."),
    h("div", { class: "row" }, phone, getCode), code);
  const card = h("div", { class: "card" }, h("b", {}, "WhatsApp connection"), body, pair);
  let timer = null;
  const draw = async () => {
    if (!view.isConnected) { clearInterval(timer); return; }
    let s; try { s = await api("/admin/whatsapp/qr"); } catch { return; }
    const kids = [];
    if (s.state === "open") {
      kids.push(h("p", {}, h("span", { class: "badge ok" }, "Connected"), s.phone ? ` +${s.phone}` : ""),
        h("p", { class: "muted" }, "Customers get their order confirmation from this number, and their replies (YES, STOP, questions) are answered automatically."),
        h("button", { class: "btn", onclick: async () => {
          if (!(await confirmDialog("Disconnect WhatsApp?", "Messages stop until you scan a new QR code.", "Disconnect"))) return;
          try { await api("/admin/whatsapp/qr/logout", { method: "POST" }); toast("Disconnected"); } catch (e) { toast(e.message, "error"); }
        } }, "Disconnect"));
    } else if (s.state === "qr" && s.qr) {
      kids.push(h("p", { class: "muted" }, QR_TEXT.qr), h("img", { src: s.qr, alt: "WhatsApp QR code", width: 260, height: 260, style: "background:#fff;padding:8px;border-radius:8px" }),
        h("p", { class: "hint" }, "On your phone: WhatsApp > Settings > Linked devices > Link a device. The code changes every minute."));
    } else if (s.state === "off") {
      kids.push(h("p", { class: "muted" }, "QR login is off. Set WHATSAPP_DRIVER=qr on the server."));
    } else kids.push(h("p", { class: "muted" }, QR_TEXT[s.state] ?? "Please wait..."));
    clear(body); put(body, ...kids);
    pair.style.display = s.state === "open" || s.state === "off" ? "none" : "";
  };
  void draw(); timer = setInterval(draw, 3000);
  return card;
}

/* Log of WhatsApp messages the server tried to send, so the owner can see why one failed. */
export async function renderWhatsapp(view) {
  const { configured, provider, items } = await api("/admin/whatsapp");
  const bc = await broadcastCard(configured);
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "WhatsApp messages"),
    h("p", { class: "muted" }, "A welcome message goes to everyone who creates an account with a number, and a confirmation to every customer who places an order."))),
    provider === "qr" ? connectCard(view) : null,
    configured || provider === "qr" ? null : h("div", { class: "card" }, h("b", {}, "WhatsApp is switched off."), h("p", { class: "muted" }, "Set WHATSAPP_DRIVER=cloud, WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server. Nothing is sent until then.")),
    bc,
    items.length ? h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["When", "Message", "To", "Result"].map((t) => h("th", {}, t)))),
      h("tbody", {}, items.map((m) => h("tr", {}, h("td", {}, fmtDate(m.createdAt)), h("td", {}, KIND[m.kind] ?? m.kind), h("td", {}, `+${m.to}`),
        h("td", {}, h("span", { class: `badge ${STATE[m.status] ?? ""}` }, m.status), m.error ? h("div", { class: "hint" }, m.error) : null))))))
      : h("div", { class: "empty" }, h("h2", {}, "No messages yet")));
}
