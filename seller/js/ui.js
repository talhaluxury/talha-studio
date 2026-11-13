/** Tiny DOM helpers. Everything is built with textContent/attributes, never innerHTML, so API data cannot inject markup. */
export function h(tag, attrs = {}, ...kids) {
  if (attrs && (attrs.nodeType || Array.isArray(attrs) || typeof attrs !== "object")) { kids.unshift(attrs); attrs = {}; }
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
export const money = (n) => "Rs. " + Number(n).toLocaleString("en-PK");
/** Appends children, flattening arrays and skipping null/false (native append would print "null" or "[object ...]"). */
export const put = (parent, ...kids) => { parent.append(...kids.flat().filter((k) => k != null && k !== false)); return parent; };
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function toast(message, type = "ok") {
  const t = h("div", { class: `toast toast-${type}`, role: type === "error" ? "alert" : "status" }, message);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), type === "error" ? 7000 : 3500);
}

export function confirmDialog(title, body, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dialog" },
      h("h2", {}, title), h("p", {}, body),
      h("div", { class: "row end" },
        h("button", { class: "btn ghost", onclick: () => dlg.close("no") }, "Cancel"),
        h("button", { class: "btn danger", onclick: () => dlg.close("yes") }, confirmLabel)));
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "yes"); dlg.remove(); });
    document.body.append(dlg); dlg.showModal();
  });
}

/** Shows field-level API errors next to inputs marked with data-err="<field path>". */
export function showFieldErrors(root, fields = {}) {
  root.querySelectorAll("[data-err]").forEach((n) => { n.textContent = ""; });
  let first = null;
  for (const [path, msg] of Object.entries(fields)) {
    const n = root.querySelector(`[data-err="${CSS.escape(path)}"]`);
    if (n) { n.textContent = msg; first ??= n; }
  }
  first?.closest(".field")?.querySelector("input,select,textarea")?.focus();
}

export const STATUS_LABEL = { pending: "Pending", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refund_requested: "Refund Requested", refunded: "Refunded" };
const STATUS_TONE = { pending: "warn", confirmed: "", processing: "", shipped: "gold", delivered: "ok", cancelled: "bad", refund_requested: "warn", refunded: "bad" };
export const statusBadge = (s) => h("span", { class: `badge ${STATUS_TONE[s] ?? ""}` }, STATUS_LABEL[s] ?? s);
export const fmtDate = (iso) => new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const kid of kids) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

/** datetime-local <-> ISO helpers (inputs show the admin's local time; the API stores UTC). */
export const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
