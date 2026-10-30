import { api, uploadTo } from "../api.js";
import { clear, fmtDate, h, put, toast } from "../ui.js";

const MAX_BYTES = 8 * 1024 * 1024;
const alive = (el) => el.isConnected;                     // the view is replaced on navigation, which stops the polling below
const clock = (iso) => new Date(iso).toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit" });

/* ---------------- Inbox: every customer who has written to the store ---------------- */
export async function renderChatInbox(view) {
  const body = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Customer chat"), h("p", { class: "muted" }, "Messages sent from the app. Customers get a phone notification when you reply."))), body);
  await load();
  const t = setInterval(() => { if (!alive(view)) return clearInterval(t); load().catch(() => {}); }, 8000);

  async function load() {
    const { items } = await api("/admin/chat?limit=50");
    put(clear(body), items.length ? items.map((c) => h("a", { class: "convo", href: `#/chat/${c.customerId}` },
      h("div", { class: "avatar" }, (c.name || "?").trim().charAt(0).toUpperCase()),
      h("div", { class: "grow" }, h("div", { class: "row between" }, h("b", {}, c.name), h("span", { class: "hint" }, fmtDate(c.last.createdAt))),
        h("div", { class: "row between" }, h("span", { class: "muted clip" }, (c.last.sender === "store" ? "You: " : "") + (c.last.body || "Photo")), c.unread ? h("span", { class: "badge gold" }, c.unread) : null))))
      : h("div", { class: "empty" }, h("h2", {}, "No messages yet"), h("p", {}, "When a customer writes from the app, the conversation appears here.")));
  }
}

/* ---------------- One conversation ---------------- */
export async function renderChatThread(view, customerId) {
  const list = h("div", { class: "thread", role: "log", "aria-live": "polite" });
  const title = h("h1", {}, "Chat"); const sub = h("p", { class: "muted" }, "");
  const input = h("textarea", { rows: 1, maxlength: 2000, placeholder: "Write a reply...", "aria-label": "Reply" });
  const send = h("button", { class: "btn gold", onclick: sendText }, "Send");
  const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr", id: "chatfile", onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > MAX_BYTES) return toast("Image is larger than 8 MB.", "error");
    try { await uploadTo(`/admin/chat/${customerId}/image`, f); await poll(true); } catch (ex) { toast(ex.message, "error"); }
  } });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("a", { href: "#/chat", class: "hint" }, "< All chats"), title, sub)),
    h("div", { class: "card chatcard" }, list, h("div", { class: "composer" }, h("label", { class: "btn ghost", for: "chatfile", title: "Send a picture" }, "Photo"), pick, input, send)));

  let last = null;
  await poll(true);
  const t = setInterval(() => { if (!alive(view)) return clearInterval(t); poll(false).catch(() => {}); }, 4000);

  async function poll(scroll) {
    const r = await api(`/admin/chat/${customerId}${last === null ? "" : `?after=${last}`}`);
    title.textContent = r.customer.name; sub.textContent = r.customer.phone ?? "";
    if (!r.items.length && last !== null) return;
    if (last === null && !r.items.length) put(list, h("div", { class: "empty" }, "No messages yet."));
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (r.items.length && last === null) clear(list);
    for (const m of r.items) {
      last = m.seq;
      put(list, h("div", { class: `bubble ${m.sender === "store" ? "mine" : "theirs"}` },
        m.imageUrl ? h("img", { src: m.imageUrl, alt: "Picture", loading: "lazy" }) : null, m.body ? h("div", {}, m.body) : null, h("small", {}, clock(m.createdAt))));
    }
    if (scroll || nearBottom) list.scrollTop = list.scrollHeight;
    if (r.items.some((m) => m.sender === "customer")) api(`/admin/chat/${customerId}/read`, { method: "POST" }).catch(() => {});
  }
  async function sendText() {
    const body = input.value.trim(); if (!body) return; send.disabled = true;
    try { await api(`/admin/chat/${customerId}`, { method: "POST", body: { body } }); input.value = ""; await poll(true); } catch (ex) { toast(ex.message, "error"); } finally { send.disabled = false; input.focus(); }
  }
}

/** Unread count for the menu badge (0 on any error). */
export async function chatUnread() { try { return (await api("/admin/chat?limit=1")).unreadTotal; } catch { return 0; } }
