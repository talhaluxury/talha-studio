import { api } from "../api.js";
import { clear, fmtDate, h, put, toast, confirmDialog } from "../ui.js";

const KIND = { welcome: "Welcome (new account)", order_confirmation: "Order confirmation", new_arrival: "New product", reply: "Reply to customer", address_ok: "Address confirmed by customer", address_fix: "Address correction", custom: "Message from admin" };
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

/* ---- QR mode tools: numbers added by hand, product messages to many people, free text messages ---- */
const AUDIENCES = { all: "Everyone (app customers + numbers I added)", customers: "Only app customers", contacts: "Only numbers I added", numbers: "Only specific numbers (good for a test)" };
function audiencePicker() {
  const sel = h("select", { "aria-label": "Who gets it" }, Object.entries(AUDIENCES).map(([v, t]) => h("option", { value: v }, t)));
  const nums = h("textarea", { rows: 3, placeholder: "03001234567, 03211234567", "aria-label": "Phone numbers", style: "display:none;width:100%;margin-top:8px" });
  sel.onchange = () => { nums.style.display = sel.value === "numbers" ? "" : "none"; };
  return { el: h("div", { style: "margin:10px 0" }, sel, nums), body: () => ({ audience: sel.value, numbers: nums.value }), label: () => AUDIENCES[sel.value] };
}

/* How fast a send goes. Faster means a higher chance that WhatsApp bans the number, especially with people who do not know the shop. */
const SPEEDS = { safe: "Safe: about 10 seconds between messages (best)", normal: "Normal: about 5 seconds between messages", fast: "Fast: about 2 seconds between messages (risky)" };
function speedPicker() {
  const sel = h("select", { "aria-label": "Speed" }, Object.entries(SPEEDS).map(([v, t]) => h("option", { value: v }, t)));
  const warn = h("p", { class: "hint", style: "display:none" }, "Fast sending to people who never wrote to you can get your WhatsApp number banned.");
  sel.onchange = () => { warn.style.display = sel.value === "fast" ? "" : "none"; };
  return { el: h("div", { style: "margin:10px 0" }, sel, warn), value: () => sel.value };
}

function jobCard(view) {
  const body = h("div", {});
  const card = h("div", { class: "card", style: "display:none" }, h("b", {}, "Sending progress"), body);
  let timer = null;
  const draw = async () => {
    if (!view.isConnected) { clearInterval(timer); return; }
    let job; try { job = (await api("/admin/whatsapp/job")).job; } catch { return; }
    if (!job) { card.style.display = "none"; return; }
    card.style.display = "";
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 100;
    put(clear(body), h("p", {}, job.finishedAt ? "Finished: " : "Sending... ", `${job.done} of ${job.total} messages`),
      h("div", { style: "height:8px;background:#8884;border-radius:4px;overflow:hidden" }, h("div", { style: `height:100%;width:${pct}%;background:#c9a24a` })),
      h("p", { class: "hint" }, `Sent ${job.sent}, failed ${job.failed}, skipped ${job.skipped} (already sent before, or the person replied STOP)`));
  };
  void draw(); timer = setInterval(draw, 4000);
  return card;
}

function contactsCard() {
  const box = h("div", { style: "max-height:260px;overflow:auto;margin-top:8px" }); const count = h("span", { class: "muted" }, "");
  const area = h("textarea", { rows: 4, placeholder: "03001234567\n0321 7654321", "aria-label": "Phone numbers", style: "width:100%" });
  const draw = async () => {
    let r; try { r = await api("/admin/whatsapp/contacts"); } catch { return; }
    count.textContent = ` ${r.total} added`;
    put(clear(box), r.items.length ? h("table", {}, h("tbody", {}, r.items.map((c) => h("tr", {}, h("td", {}, `+${c.phone}`),
      h("td", {}, h("button", { class: "btn", onclick: async () => { try { await api(`/admin/whatsapp/contacts/${c.id}`, { method: "DELETE" }); void draw(); } catch (e) { toast(e.message, "error"); } } }, "Remove")))))) : null);
  };
  const add = h("button", { class: "btn gold", onclick: async () => {
    try {
      const r = await api("/admin/whatsapp/contacts", { method: "POST", body: { numbers: area.value } }); area.value = "";
      toast(`${r.added} added${r.existing ? `, ${r.existing} already there` : ""}${r.invalid.length ? `, not valid: ${r.invalid.join(", ")}` : ""}`); void draw();
    } catch (e) { toast(e.message, "error"); }
  } }, "Add numbers");
  void draw();
  return h("div", { class: "card" }, h("b", {}, "Add customer numbers"), count,
    h("p", { class: "muted" }, "Paste numbers, one per line or separated by commas. These people get your product messages too."), area, h("div", { class: "row", style: "margin-top:8px" }, add), box);
}

async function sendProductsCard() {
  let products = [];
  try { for (let page = 1; page <= 4; page++) { const r = await api(`/admin/products?page=${page}&limit=50`); products.push(...r.items.filter((p) => p.isPublished)); if (r.items.length < 50) break; } } catch { /* empty list below */ }
  const picked = new Set(); const counter = h("span", { class: "muted" }, " 0 of 15 chosen");
  const rows = products.map((p) => {
    const cb = h("input", { type: "checkbox", "aria-label": p.name });
    cb.onchange = () => {
      if (cb.checked) { if (picked.size >= 15) { cb.checked = false; toast("You can choose at most 15 products", "error"); return; } picked.add(p.id); } else picked.delete(p.id);
      counter.textContent = ` ${picked.size} of 15 chosen`;
    };
    return h("label", { style: "display:flex;gap:8px;align-items:center;padding:4px 0" }, cb, h("span", {}, p.name, p.price != null ? ` · Rs ${(p.salePrice ?? p.price).toLocaleString("en-US")}` : ""));
  });
  const aud = audiencePicker(); const spd = speedPicker();
  const btn = h("button", { class: "btn gold", disabled: !products.length, onclick: async () => {
    if (!picked.size) { toast("Choose at least one product", "error"); return; }
    if (!(await confirmDialog("Send these products?", `${picked.size} product(s) to: ${aud.label()}. Each person gets them one by one, slowly, with the photo.`, "Send"))) return;
    try { const r = await api("/admin/whatsapp/send-products", { method: "POST", body: { productIds: [...picked], ...aud.body(), speed: spd.value() } }); toast(`Sending ${r.messages} messages to ${r.recipients} numbers (about ${r.minutes} min).`); }
    catch (e) { toast(e.message, "error"); }
  } }, "Send products");
  return h("div", { class: "card" }, h("b", {}, "Send products"), counter,
    h("p", { class: "muted" }, "Choose up to 15 products. Each one goes as its own message with the photo, name, price and a short description."),
    h("div", { style: "max-height:300px;overflow:auto;border:1px solid #8884;border-radius:8px;padding:6px 10px" }, rows.length ? rows : h("p", { class: "muted" }, "No published products yet.")), aud.el, spd.el, btn);
}

function customCard() {
  const text = h("textarea", { rows: 5, maxlength: 1000, placeholder: "Assalam o Alaikum {name}! ...", "aria-label": "Message", style: "width:100%" });
  const aud = audiencePicker(); const spd = speedPicker();
  const btn = h("button", { class: "btn gold", onclick: async () => {
    if (!text.value.trim()) { toast("Write a message first", "error"); return; }
    if (!(await confirmDialog("Send this message?", `To: ${aud.label()}.`, "Send"))) return;
    try { const r = await api("/admin/whatsapp/send-custom", { method: "POST", body: { text: text.value, ...aud.body(), speed: spd.value() } }); toast(`Sending to ${r.recipients} numbers (about ${r.minutes} min).`); text.value = ""; }
    catch (e) { toast(e.message, "error"); }
  } }, "Send message");
  return h("div", { class: "card" }, h("b", {}, "Send a message"),
    h("p", { class: "muted" }, "Write anything you want to tell your customers. {name} becomes the customer's first name."), text, aud.el, spd.el, btn);
}

/* Owner switch: ON = the AI answers customers (WhatsApp + app), OFF = only people answer. */
async function aiCard() {
  let on = true; try { on = (await api("/admin/ai-replies")).enabled; } catch { /* keeps the default */ }
  const state = h("b", {}); const btn = h("button", { class: "btn", type: "button" });
  const paint = () => { state.textContent = on ? "AI auto-reply is ON" : "AI auto-reply is OFF"; btn.textContent = on ? "Turn OFF" : "Turn ON"; btn.className = on ? "btn" : "btn gold"; };
  btn.onclick = async () => {
    btn.disabled = true;
    try { on = (await api("/admin/ai-replies", { method: "PUT", body: { enabled: !on } })).enabled; paint(); toast(on ? "AI replies are ON" : "AI replies are OFF"); }
    catch (ex) { toast(ex.message, "error"); } finally { btn.disabled = false; }
  };
  paint();
  return h("div", { class: "card" }, h("div", { class: "row between" }, h("div", {}, state,
    h("p", { class: "muted" }, "ON: the AI answers customers on WhatsApp and in the app. OFF: nobody answers automatically, not even the YES order confirmation. Only you reply.")), btn));
}

/* Log of WhatsApp messages the server tried to send, so the owner can see why one failed. */
export async function renderWhatsapp(view) {
  const { configured, provider, items } = await api("/admin/whatsapp");
  const bc = provider === "qr" ? null : await broadcastCard(configured);
  const qrTools = provider === "qr" ? [jobCard(view), await sendProductsCard(), customCard(), contactsCard()] : [];
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "WhatsApp messages"),
    h("p", { class: "muted" }, "A welcome message goes to everyone who creates an account with a number, and a confirmation to every customer who places an order."))),
    await aiCard(),
    provider === "qr" ? connectCard(view) : null,
    configured || provider === "qr" ? null : h("div", { class: "card" }, h("b", {}, "WhatsApp is switched off."), h("p", { class: "muted" }, "Set WHATSAPP_DRIVER=cloud, WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server. Nothing is sent until then.")),
    bc,
    ...qrTools,
    items.length ? h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["When", "Message", "To", "Result"].map((t) => h("th", {}, t)))),
      h("tbody", {}, items.map((m) => h("tr", {}, h("td", {}, fmtDate(m.createdAt)), h("td", {}, KIND[m.kind] ?? m.kind), h("td", {}, `+${m.to}`),
        h("td", {}, h("span", { class: `badge ${STATE[m.status] ?? ""}` }, m.status), m.error ? h("div", { class: "hint" }, m.error) : null))))))
      : h("div", { class: "empty" }, h("h2", {}, "No messages yet")));
}
