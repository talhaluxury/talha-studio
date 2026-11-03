import { api } from "../api.js";
import { clear, h, put, showFieldErrors, toast } from "../ui.js";

const PAGES = [["privacy", "Privacy Policy"], ["terms", "Terms of Service"], ["returns", "Returns Policy"], ["shipping", "Shipping Policy"], ["refund", "Refund Policy"], ["about", "About Us"]];

export async function renderStoreSettings(view) {
  const s = await api("/admin/store-settings");
  const f = {
    flat: h("input", { id: "flat", type: "number", min: 0, step: 1, value: s.shipping.flat }), free: h("input", { id: "free", type: "number", min: 0, step: 1, value: s.shipping.freeOver }),
    ann: h("input", { id: "ann", maxlength: 120, value: s.announcement.text, placeholder: "e.g. Eid sale: free delivery over Rs. 5,000" }), annOn: h("input", { id: "annon", type: "checkbox", checked: s.announcement.active }),
    jc: h("input", { id: "jc", maxlength: 200, value: s.paymentAccounts?.jazzcash ?? "", placeholder: "e.g. Talha Studio - 0300 1234567" }),
    ep: h("input", { id: "ep", maxlength: 200, value: s.paymentAccounts?.easypaisa ?? "", placeholder: "e.g. Talha Studio - 0345 1234567" }),
    bk: h("input", { id: "bk", maxlength: 300, value: s.paymentAccounts?.bank ?? "", placeholder: "e.g. Meezan Bank - Talha Studio - IBAN PK00MEZN..." }),
  };
  const pages = Object.fromEntries(PAGES.map(([k]) => [k, h("textarea", { id: `pg-${k}`, class: "pagebox", maxlength: 20000 }, s.pages[k])]));
  const save = h("button", { class: "btn gold", type: "submit" }, "Save store settings");
  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); save.disabled = true;
    const body = { shipping: { flat: Number(f.flat.value) || 0, freeOver: Number(f.free.value) || 0 }, announcement: { text: f.ann.value.trim(), active: f.annOn.checked },
      paymentAccounts: { jazzcash: f.jc.value.trim(), easypaisa: f.ep.value.trim(), bank: f.bk.value.trim() },
      pages: Object.fromEntries(PAGES.map(([k]) => [k, pages[k].value])) };
    try { await api("/admin/store-settings", { method: "PUT", body }); showFieldErrors(form, {}); toast("Store settings saved"); }
    catch (ex) { showFieldErrors(form, ex.fields); toast(ex.message, "error"); } finally { save.disabled = false; }
  } },
    h("div", { class: "card" }, h("h2", {}, "Delivery charges"),
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", { for: "flat" }, "Delivery fee (Rs.)"), f.flat, h("div", { class: "err", "data-err": "shipping.flat" })),
        h("div", { class: "field" }, h("label", { for: "free" }, "Free delivery over (Rs.)"), f.free, h("div", { class: "hint" }, "0 turns free delivery off. Judged after any coupon discount."), h("div", { class: "err", "data-err": "shipping.freeOver" })))),
    h("div", { class: "card" }, h("h2", {}, "Payment accounts"),
      h("p", { class: "hint" }, "Customers see these at checkout, send the money, and type the transaction ID. A method is offered only when its box is filled in. Cash on Delivery is always available. You confirm each payment on the order page."),
      h("div", { class: "field" }, h("label", { for: "jc" }, "JazzCash (name and number)"), f.jc),
      h("div", { class: "field" }, h("label", { for: "ep" }, "Easypaisa (name and number)"), f.ep),
      h("div", { class: "field" }, h("label", { for: "bk" }, "Bank transfer (bank, account title, IBAN)"), f.bk)),
    h("div", { class: "card" }, h("h2", {}, "Home announcement"), h("p", { class: "hint" }, "A one-line strip at the top of the app home screen."),
      h("div", { class: "field" }, h("label", { for: "ann" }, "Message"), f.ann, h("div", { class: "err", "data-err": "announcement.text" })), h("label", { class: "check", for: "annon" }, f.annOn, "Show it")),
    h("div", { class: "card" }, h("h2", {}, "Policy pages"),
      h("p", { class: "hint" }, "These appear in the app (Profile > policies) and as public web pages. The starting texts describe how the app works but are not legal advice: have them reviewed before launch. Blank line = new paragraph; start a line with \"# \" for a heading."),
      h("p", { class: "hint" }, ["Public privacy page for Google Play: ", h("b", {}, "https://YOUR-API-HOST/legal/privacy")]),
      PAGES.map(([k, title]) => h("details", {}, h("summary", {}, h("b", {}, title), " ", h("span", { class: "hint" }, `/legal/${k}`)), h("div", { class: "field" }, pages[k], h("div", { class: "err", "data-err": `pages.${k}` }))))),
    h("div", { class: "row" }, save));
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Store settings"), h("p", { class: "muted" }, "Owner only. Changes reach customers immediately."))), form);
}
