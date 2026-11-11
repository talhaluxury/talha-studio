import { api, session } from "../api.js";
import { refreshAlerts } from "../alerts.js";
import { firstImage, MESSAGE_KINDS, orderMessage, sendViaStore, sendWhatsApp } from "../waOrder.js";
import { clear, confirmDialog, fmtDate, h, money, put, showFieldErrors, STATUS_LABEL, statusBadge, toast } from "../ui.js";

export async function renderOrderDetail(view, id) {
  let o = await api(`/admin/orders/${id}`);
  let aiOn = null; try { aiOn = (await api("/admin/ai-replies")).enabled; } catch { /* staff accounts cannot read it: the card still works */ }
  const root = h("div", {});
  put(clear(view), root);
  draw();


  async function deleteOrder() {
    if (!(await confirmDialog(`Delete order ${o.orderNumber}?`, "It is removed for good. If it is still open it is cancelled first so its stock goes back on sale. The customer is not notified.", "Delete"))) return;
    try { await api(`/admin/orders/${o.id}`, { method: "DELETE" }); toast(`Order ${o.orderNumber} deleted`); refreshAlerts(); location.hash = "#/orders"; }
    catch (e) { toast(e.message, "error"); }
  }

  /** Manual WhatsApp: works whether the AI is on or off. Opens WhatsApp on this customer's chat with the message and product photo ready. */
  function waCard() {
    const img = firstImage(o);
    const kind = h("select", { id: "wakind", "aria-label": "Message type" }, Object.entries(MESSAGE_KINDS).map(([v, t]) => h("option", { value: v }, t)));
    const text = h("textarea", { id: "watext", maxlength: 1500, "aria-label": "WhatsApp message" }, orderMessage(o, "confirm"));
    kind.addEventListener("change", () => { text.value = orderMessage(o, kind.value); });
    const photo = h("input", { type: "checkbox", id: "waphoto", checked: !!img, disabled: !img });
    const go = h("button", { class: "btn wabtn", type: "button", onclick: async () => {
      if (!text.value.trim()) { toast("Write a message first.", "error"); return; }
      go.disabled = true; try { await sendViaStore(o, text.value, photo.checked); } finally { go.disabled = false; }
    } }, "Send on WhatsApp");
    const open = h("button", { class: "btn ghost", type: "button", onclick: () => sendWhatsApp(o, text.value, { photo: photo.checked }) }, "Open in my WhatsApp");
    const mark = o.status === "pending" && o.allowedNext.includes("confirmed") ? h("button", { class: "btn ghost", type: "button", onclick: async (ev) => {
      ev.target.disabled = true;
      try { o = await api(`/admin/orders/${o.id}/status`, { method: "PATCH", body: { status: "confirmed", note: "Confirmed by admin on WhatsApp", trackingUrl: null } }); toast("Order marked Confirmed"); draw(); }
      catch (e) { toast(e.message, "error"); ev.target.disabled = false; }
    } }, "Mark order Confirmed") : null;
    return h("div", { class: "card wa" }, h("h2", {}, "WhatsApp customer"),
      h("p", { class: aiOn === false ? "" : "muted" }, aiOn === false ? "AI auto-reply is OFF, so you confirm this order yourself: tap Send on WhatsApp, then mark the order Confirmed."
        : "The AI messages customers automatically. Use this when you want to write to the customer yourself."),
      h("div", { class: "wahead" }, img ? h("img", { class: "wapic", src: img, alt: "" }) : null,
        h("div", {}, h("b", {}, o.customer.name), h("div", { class: "hint" }, o.customer.phone), h("div", { class: "hint" }, o.items[0]?.name ?? ""))),
      h("div", { class: "field" }, h("label", { for: "wakind" }, "Message"), kind), text,
      h("label", { class: "check", for: "waphoto" }, photo, "Attach product photo"),
      h("p", { class: "hint" }, "Goes out from the WhatsApp number linked in the WhatsApp menu, like the automatic messages. \"Open in my WhatsApp\" is only a backup."),
      h("div", { class: "row" }, go, mark, open));
  }

  function draw() {
    const a = o.address;
    const status = h("select", { id: "newstatus", "aria-label": "New status" }, h("option", { value: "" }, "Choose next status"), o.allowedNext.map((s) => h("option", { value: s }, STATUS_LABEL[s])));
    const note = h("input", { id: "note", maxlength: 300, placeholder: "Optional note (kept in history)" });
    const track = h("input", { id: "track", type: "url", maxlength: 300, placeholder: "https://tracking-link (optional)" });
    const trackField = h("div", { class: "field", hidden: true }, h("label", { for: "track" }, "Tracking link"), track, h("div", { class: "err", "data-err": "trackingUrl" }));
    status.addEventListener("change", () => { trackField.hidden = status.value !== "shipped"; });
    const save = h("button", { class: "btn gold", type: "button", onclick: async () => {
      if (!status.value) { toast("Choose the next status first.", "error"); return; }
      if (status.value === "cancelled" && !(await confirmDialog("Cancel this order?", "Reserved stock goes back on sale. The customer is notified.", "Cancel order"))) return;
      save.disabled = true;
      try {
        o = await api(`/admin/orders/${o.id}/status`, { method: "PATCH", body: { status: status.value, note: note.value.trim() || null, trackingUrl: track.value.trim() || null } });
        toast(`Order marked ${STATUS_LABEL[o.status]}`); draw();
      } catch (e) { showFieldErrors(root, e.fields); toast(e.message, "error"); save.disabled = false; }
    } }, "Update status");

    put(clear(root),
      h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, o.orderNumber), h("p", { class: "muted" }, [statusBadge(o.status), `  Placed ${fmtDate(o.createdAt)}`])),
        h("div", { class: "row" }, h("a", { class: "btn ghost", href: "#/orders" }, "Back to orders"),
          session.canWrite() ? h("button", { class: "btn danger", type: "button", onclick: deleteOrder }, "Delete order") : null)),
      h("div", { class: "cols" },
        h("div", { class: "card" }, h("h2", {}, "Customer"),
          h("dl", { class: "kv" }, h("dt", {}, "Name"), h("dd", {}, o.customer.name), h("dt", {}, "Phone"), h("dd", {}, o.customer.phone), h("dt", {}, "Email"), h("dd", {}, o.customer.email))),
        h("div", { class: "card" }, h("h2", {}, "Delivery address"),
          h("dl", { class: "kv" }, h("dt", {}, "Address"), h("dd", {}, [a.line1, a.line2].filter(Boolean).join(", ")), h("dt", {}, "City"), h("dd", {}, [a.city, a.province, a.postalCode].filter(Boolean).join(", ")),
            o.notes ? [h("dt", {}, "Customer note"), h("dd", {}, o.notes)] : null, o.trackingUrl ? [h("dt", {}, "Tracking"), h("dd", {}, o.trackingUrl)] : null))),
      waCard(),
      h("div", { class: "card" }, h("h2", {}, "Items"),
        h("table", {}, h("thead", {}, h("tr", {}, ["", "Product", "Options", "Price", "Qty", "Line total"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, o.items.map((i) => h("tr", {},
            h("td", {}, i.imageUrl ? h("img", { src: i.imageUrl, alt: "", loading: "lazy" }) : h("div", { class: "thumb", "aria-hidden": "true" }, i.name[0])),
            h("td", { "data-label": "Product" }, h("b", {}, i.name), h("div", { class: "hint" }, i.sku)), h("td", { "data-label": "Options" }, [i.color, i.size].filter(Boolean).join(" / ") || "-"),
            h("td", { "data-label": "Price" }, money(i.unitPrice)), h("td", { "data-label": "Qty" }, i.qty), h("td", { "data-label": "Line total" }, money(i.unitPrice * i.qty)))))),
        h("div", { class: "sum" }, h("div", {}, h("span", {}, "Subtotal"), h("span", {}, money(o.subtotal))),
          o.discount ? h("div", {}, h("span", {}, "Discount"), h("span", {}, "- " + money(o.discount))) : null,
          h("div", {}, h("span", {}, "Shipping"), h("span", {}, o.shipping ? money(o.shipping) : "Free")),
          h("div", { class: "tot" }, h("span", {}, "Total"), h("span", {}, money(o.total))),
          h("div", { class: "hint" }, h("span", {}, `Payment: ${o.paymentMethod.toUpperCase()}`), h("span", {}, o.paymentStatus)),
          o.paymentMethod !== "cod" ? h("div", { class: "hint" }, h("span", {}, `Transaction ID: ${o.paymentRef || "-"}`),
            h("button", { class: o.paymentStatus === "paid" ? "btn ghost sm" : "btn gold sm", type: "button", onclick: async (ev) => {
              ev.target.disabled = true;
              try { o = await api(`/admin/orders/${o.id}/payment`, { method: "PATCH", body: { status: o.paymentStatus === "paid" ? "unpaid" : "paid" } }); toast(o.paymentStatus === "paid" ? "Payment confirmed" : "Payment marked unpaid"); draw(); }
              catch (e) { toast(e.message, "error"); ev.target.disabled = false; }
            } }, o.paymentStatus === "paid" ? "Mark unpaid" : "Confirm payment received")) : null)),
      h("div", { class: "cols" },
        h("div", { class: "card" }, h("h2", {}, "Update status"),
          o.allowedNext.length ? [h("div", { class: "field" }, h("label", { for: "newstatus" }, "Next status"), status), h("div", { class: "field" }, h("label", { for: "note" }, "Note"), note), trackField, save]
            : h("p", { class: "muted" }, "This order is in a final state. No further changes are possible.")),
        h("div", { class: "card" }, h("h2", {}, "History"),
          h("ul", { class: "tl" }, [...o.history].reverse().map((x) => h("li", {}, h("b", {}, STATUS_LABEL[x.status]), h("div", { class: "hint" }, fmtDate(x.at)), x.note ? h("div", {}, x.note) : null))))));
  }
}
