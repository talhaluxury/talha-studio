import { api } from "../api.js";
import { clear, h, put, showFieldErrors, toast } from "../ui.js";

const PAGES = [["privacy", "Privacy Policy"], ["terms", "Terms of Service"], ["returns", "Returns Policy"], ["shipping", "Shipping Policy"], ["refund", "Refund Policy"], ["about", "About Us"]];

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export async function renderStoreSettings(view) {
  const s = await api("/admin/store-settings");
  const sale = s.sale ?? { active: false, label: "Sale ends in", endsAt: null }, spin = s.spin ?? { active: false, percents: [5, 10, 15] };
  const f = {
    saleOn: h("input", { id: "saleon", type: "checkbox", checked: sale.active }), saleLabel: h("input", { id: "salelabel", maxlength: 40, value: sale.label, placeholder: "e.g. Eid sale ends in" }),
    saleEnd: h("input", { id: "saleend", type: "datetime-local", value: toLocalInput(sale.endsAt) }),
    spinOn: h("input", { id: "spinon", type: "checkbox", checked: spin.active }), spinPct: h("input", { id: "spinpct", value: spin.percents.join(", "), placeholder: "e.g. 5, 10, 15, 20" }),
    flat: h("input", { id: "flat", type: "number", min: 0, step: 1, value: s.shipping.flat }), free: h("input", { id: "free", type: "number", min: 0, step: 1, value: s.shipping.freeOver }),
    ann: h("input", { id: "ann", maxlength: 120, value: s.announcement.text, placeholder: "e.g. Eid sale: free delivery over Rs. 5,000" }), annOn: h("input", { id: "annon", type: "checkbox", checked: s.announcement.active }),
    jc: h("input", { id: "jc", maxlength: 200, value: s.paymentAccounts?.jazzcash ?? "", placeholder: "e.g. Talha Studio - 0300 1234567" }),
    ep: h("input", { id: "ep", maxlength: 200, value: s.paymentAccounts?.easypaisa ?? "", placeholder: "e.g. Talha Studio - 0345 1234567" }),
    bk: h("input", { id: "bk", maxlength: 300, value: s.paymentAccounts?.bank ?? "", placeholder: "e.g. Meezan Bank - Talha Studio - IBAN PK00MEZN..." }),
  };
  const pages = Object.fromEntries(PAGES.map(([k]) => [k, h("textarea", { id: `pg-${k}`, class: "pagebox", maxlength: 20000 }, s.pages[k])]));
  const save = h("button", { class: "btn gold", type: "submit" }, "Save store settings");
  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const percents = f.spinPct.value.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 90).slice(0, 8);
    if (f.saleOn.checked && !f.saleEnd.value) return toast("Pick the date and time the sale ends", "error");
    if (f.spinOn.checked && !percents.length) return toast("Type at least one discount percentage for the lucky wheel, e.g. 5, 10, 15", "error");
    save.disabled = true;
    const body = { sale: { active: f.saleOn.checked, label: f.saleLabel.value.trim() || "Sale ends in", endsAt: f.saleEnd.value ? new Date(f.saleEnd.value).toISOString() : null },
      spin: { active: f.spinOn.checked, percents: percents.length ? percents : spin.percents }, shipping: { flat: Number(f.flat.value) || 0, freeOver: Number(f.free.value) || 0 }, announcement: { text: f.ann.value.trim(), active: f.annOn.checked },
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
    h("div", { class: "card" }, h("h2", {}, "Sale timer"),
      h("p", { class: "hint" }, "A small countdown bar above the bottom bar of the app. Customers tap it to see every item on sale, and the timer also shows on sale products. It disappears by itself when the time is over."),
      h("div", { class: "field" }, h("label", { for: "salelabel" }, "Text before the timer"), f.saleLabel, h("div", { class: "err", "data-err": "sale.label" })),
      h("div", { class: "field" }, h("label", { for: "saleend" }, "Sale ends on (your time)"), f.saleEnd, h("div", { class: "err", "data-err": "sale.endsAt" })),
      h("label", { class: "check", for: "saleon" }, f.saleOn, "Show the sale timer")),
    h("div", { class: "card" }, h("h2", {}, "Lucky wheel (Spin & Win)"),
      h("p", { class: "hint" }, "A wheel button on the app home screen. Each signed-in customer can spin once a day and wins a single-use coupon (valid 3 days) with one of these discounts. Every slice of the wheel is one of your percentages."),
      h("div", { class: "field" }, h("label", { for: "spinpct" }, "Discount percentages (comma separated, max 8)"), f.spinPct, h("div", { class: "err", "data-err": "spin.percents" })),
      h("label", { class: "check", for: "spinon" }, f.spinOn, "Turn the lucky wheel on")),
    h("div", { class: "card" }, h("h2", {}, "Policy pages"),
      h("p", { class: "hint" }, "These appear in the app (Profile > policies) and as public web pages. The starting texts describe how the app works but are not legal advice: have them reviewed before launch. Blank line = new paragraph; start a line with \"# \" for a heading."),
      h("p", { class: "hint" }, ["Public privacy page for Google Play: ", h("b", {}, "https://YOUR-API-HOST/legal/privacy")]),
      PAGES.map(([k, title]) => h("details", {}, h("summary", {}, h("b", {}, title), " ", h("span", { class: "hint" }, `/legal/${k}`)), h("div", { class: "field" }, pages[k], h("div", { class: "err", "data-err": `pages.${k}` }))))),
    h("div", { class: "row" }, save));
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Store settings"), h("p", { class: "muted" }, "Owner only. Changes reach customers immediately."))), await walletCard(), form);
}

/* Welcome bonus + referral: one tap switches an offer ON or OFF at any time (saved at once). Money already given stays in the customers' wallets. */
async function walletCard() {
  let w; try { w = await api("/admin/wallet-offers"); } catch { return null; }
  const save = async () => { w = await api("/admin/wallet-offers", { method: "PUT", body: w }); };
  const offer = (key, title, hint) => {
    const state = h("b", {}); const btn = h("button", { type: "button" });
    const amt = h("input", { type: "number", min: 0, max: 100000, step: 50, value: w[key].amount, style: "max-width:120px", "aria-label": title + " amount" });
    const paint = () => { const on = w[key].active; state.textContent = `${title}: ${on ? "ON" : "OFF"}`; state.style.color = on ? "#2e8b57" : "#c0392b"; btn.textContent = on ? "Turn OFF" : "Turn ON"; btn.className = on ? "btn" : "btn gold"; };
    btn.onclick = async () => { btn.disabled = true; const was = w[key].active; try { w[key].active = !was; await save(); paint(); toast(`${title} is now ${w[key].active ? "ON" : "OFF"}`); } catch (ex) { w[key].active = was; toast(ex.message, "error"); } finally { btn.disabled = false; } };
    const amtBtn = h("button", { class: "btn ghost sm", type: "button", onclick: async () => { try { w[key].amount = Math.max(0, Math.round(+amt.value || 0)); await save(); toast("Amount saved"); } catch (ex) { toast(ex.message, "error"); } } }, "Save amount");
    paint();
    return h("div", { class: "field" }, h("div", { class: "row between" }, state, btn), h("div", { class: "row" }, h("span", { class: "muted" }, "Rs."), amt, amtBtn), h("p", { class: "hint" }, hint));
  };
  return h("div", { class: "card" }, h("h2", {}, "Wallet offers"),
    h("p", { class: "muted" }, "Customers get a wallet when they sign up with Google. The wallet money is taken off their order automatically (never off delivery). Turn an offer OFF whenever you do not want to give it: it stops at once for new sign-ups."),
    offer("signupBonus", "Welcome bonus", "Given once to every customer who has not ordered yet."),
    offer("referral", "Referral bonus (each side)", "A friend signs up with a customer's referral code: both get this amount."));
}
