import { api, session } from "../api.js";
import { renderBrandPage } from "../brandPreview.js";
import { clear, fmtDate, h, money, put, toast } from "../ui.js";

const ACCOUNT = { pending: ["Waiting for approval", "warn"], active: ["Active", "ok"], rejected: ["Rejected", "bad"], suspended: ["Suspended", "bad"] };
const PAGE = { draft: ["No page sent", ""], submitted: ["Page to review", "warn"], approved: ["Page live", "ok"], rejected: ["Page sent back", "bad"] };
const PSTATE = { draft: ["Draft", ""], pending: ["To review", "warn"], approved: ["Live", "ok"], rejected: ["Rejected", "bad"] };
const badge = (map, k) => h("span", { class: `badge ${map[k]?.[1] ?? ""}` }, map[k]?.[0] ?? k);

/** Asks for a short reason (sellers see it) and resolves with the text, or null when cancelled. */
function askNote(title, confirmLabel) {
  return new Promise((resolve) => {
    const ta = h("textarea", { rows: 3, maxlength: 300, placeholder: "Write a short, clear reason for the seller" });
    const dlg = h("dialog", { class: "dialog" }, h("h2", {}, title), ta,
      h("div", { class: "row end", style: "margin-top:12px" }, h("button", { class: "btn ghost", onclick: () => dlg.close("no") }, "Cancel"), h("button", { class: "btn danger", onclick: () => { if (ta.value.trim().length < 3) { ta.focus(); return; } dlg.close("yes"); } }, confirmLabel)));
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "yes" ? ta.value.trim() : null); dlg.remove(); });
    document.body.append(dlg); dlg.showModal();
  });
}

export async function renderBrands(view, id) {
  if (id) return detail(view, id);
  let status = "";
  const body = h("div", {});
  const tabs = h("div", { class: "tabs" });
  const FILTERS = [["", "All"], ["pending", "Applications"], ["active", "Active"], ["suspended", "Suspended"], ["rejected", "Rejected"]];
  const drawTabs = () => { clear(tabs).append(...FILTERS.map(([k, t]) => h("button", { class: "tab", type: "button", "aria-pressed": String(status === k), onclick: () => { status = k; drawTabs(); load(); } }, t))); };
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Brands"), h("p", { class: "muted" }, "Seller accounts and their brand pages. Approve an application first, then review the page they send."))), tabs, body);
  drawTabs(); await load();
  async function load() {
    const { items } = await api(`/admin/brands${status ? `?status=${status}` : ""}`);
    clear(body).append(items.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Brand", "Owner", "City", "Account", "Page", "Products", "Applied"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, items.map((b) => h("tr", {},
        h("td", { "data-label": "Brand" }, h("a", { href: `#/brands/${b.id}` }, h("b", {}, b.name))), h("td", { "data-label": "Owner" }, b.owner.fullName, h("div", { class: "hint" }, b.contactPhone)),
        h("td", { "data-label": "City" }, b.city), h("td", { "data-label": "Account" }, badge(ACCOUNT, b.status)), h("td", { "data-label": "Page" }, badge(PAGE, b.pageStatus)),
        h("td", { "data-label": "Products" }, `${b.productCount}`, b.pendingProducts ? h("span", { class: "badge warn", style: "margin-left:6px" }, `${b.pendingProducts} to review`) : null),
        h("td", { "data-label": "Applied" }, fmtDate(b.createdAt))))))) : h("div", { class: "empty" }, h("h2", {}, "Nothing here"), h("p", {}, "No brands match this filter.")));
  }
}

async function detail(view, id) {
  const write = session.canWrite(); const b = await api(`/admin/brands/${id}`);
  const act = async (path, body, okMsg) => { try { await api(`/admin/brands/${id}/${path}`, { method: "POST", body }); toast(okMsg); await detail(clear(view), id); } catch (e) { toast(e.message, "error"); } };
  const actions = [];
  if (write) {
    if (b.status === "pending" || b.status === "rejected") actions.push(h("button", { class: "btn gold", onclick: () => act("approve", undefined, "Seller approved") }, "Approve seller"));
    if (b.status === "pending") actions.push(h("button", { class: "btn danger", onclick: async () => { const n = await askNote("Reject this application?", "Reject"); if (n) act("reject", { note: n }, "Application rejected"); } }, "Reject"));
    if (b.status === "active") actions.push(h("button", { class: "btn danger", onclick: async () => { const n = await askNote("Suspend this brand? Its page and products disappear from the app.", "Suspend"); if (n) act("suspend", { note: n }, "Brand suspended"); } }, "Suspend"));
    if (b.status === "suspended") actions.push(h("button", { class: "btn gold", onclick: () => act("unsuspend", undefined, "Brand is active again") }, "Lift suspension"));
  }
  const allProducts = b.products;
  const review = b.pageStatus === "submitted" && b.status === "active";
  const phone = (content, title) => h("div", { class: "bcol" }, h("h3", {}, title), (() => { const p = h("div", { class: "bphone" }); p.append(renderBrandPage(content, allProducts, { scroller: p })); return p; })());
  put(clear(view),
    h("a", { href: "#/brands" }, "← All brands"),
    h("div", { class: "pagehead", style: "margin-top:8px" }, h("div", {}, h("h1", {}, b.draft.name), h("div", { class: "row" }, badge(ACCOUNT, b.status), badge(PAGE, b.pageStatus))), h("div", { class: "row" }, actions)),
    b.statusNote ? h("div", { class: "banner" }, `Note: ${b.statusNote}`) : null,
    h("div", { class: "card" }, h("h2", {}, "Seller"), h("p", { style: "margin:0;line-height:1.7" }, h("b", {}, b.owner.fullName), " · ", b.owner.email, h("br"), `Phone: ${b.contactPhone} · City: ${b.city}`, h("br"), b.businessNote ? `What they sell: ${b.businessNote}` : "No business note", h("br"), `Applied ${fmtDate(b.createdAt)}`)),
    review ? h("div", { class: "card reviewbar" }, h("div", {}, h("h2", {}, "Page waiting for review"), h("p", { class: "muted" }, `Sent ${fmtDate(b.submittedAt)}. Approving publishes the page and all products marked "To review".`)),
      write ? h("div", { class: "row" }, h("button", { class: "btn gold", onclick: () => act("page/approve", undefined, "Page approved and published") }, "Approve & publish"),
        h("button", { class: "btn danger", onclick: async () => { const n = await askNote("Send the page back with changes?", "Send back"); if (n) act("page/reject", { note: n }, "Sent back to the seller"); } }, "Send back")) : null) : null,
    b.pageStatus === "rejected" && b.pageNote ? h("div", { class: "banner bad" }, `Sent back: ${b.pageNote}`) : null,
    h("div", { class: "bpair" }, phone(b.draft, "Seller's draft (what you would publish)"), b.live ? phone(b.live, "Currently live") : h("div", { class: "bcol" }, h("h3", {}, "Currently live"), h("p", { class: "muted" }, "Nothing is live yet."))),
    h("div", { class: "card" }, h("h2", {}, `Products (${allProducts.length})`),
      allProducts.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["", "Product", "Price", "Stock", "State", ""].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, allProducts.map((p) => h("tr", {},
          h("td", {}, p.images[0] ? h("img", { src: p.images[0].thumbUrl, alt: "", style: "width:48px;height:48px;object-fit:cover;border-radius:8px" }) : h("div", { class: "thumb", "aria-hidden": "true" }, p.name[0])),
          h("td", { "data-label": "Product" }, h("a", { href: `#/products/${p.id}` }, h("b", {}, p.name)), h("div", { class: "hint" }, p.category?.name ?? "")),
          h("td", { "data-label": "Price" }, money(p.salePrice ?? p.price)), h("td", { "data-label": "Stock" }, p.variants.reduce((n, v) => n + v.stock, 0)),
          h("td", { "data-label": "State" }, badge(PSTATE, p.state), p.note ? h("div", { class: "hint" }, p.note) : null),
          h("td", {}, write && p.state !== "rejected" ? h("button", { class: "btn sm danger", onclick: async () => { const n = await askNote(`Reject "${p.name}"?`, "Reject"); if (n) act(`products/${p.id}/reject`, { note: n }, "Product rejected"); } }, "Reject") : null)))))) : h("p", { class: "muted" }, "No products yet.")));
}
