import { api } from "../api.js";
import { h, put } from "../ui.js";

const PAGE = { draft: ["Not sent yet", "warn"], submitted: ["Waiting for our review", "warn"], approved: ["Live in the app", "ok"], rejected: ["Needs changes", "bad"] };

export async function renderOverview(root, ctx) {
  const me = await ctx.reload(); const b = me.brand;
  const [{ items: products }, pending, all] = await Promise.all([api("/seller/products"), api("/seller/orders?status=pending&limit=1"), api("/seller/orders?limit=1")]);
  const live = products.filter((p) => p.state === "approved").length; const review = products.filter((p) => p.state === "pending").length;
  const unsent = JSON.stringify(strip(b.draft)) !== JSON.stringify(strip(b.live)) && b.pageStatus !== "submitted";
  const [label, tone] = PAGE[b.pageStatus];
  const steps = [
    ["Add your logo", !!b.draft.logoUrl, "#/page"], ["Add a cover picture and your story", !!(b.draft.coverUrl && b.draft.about), "#/page"],
    ["Add at least one product with photos", products.some((p) => p.images.length), "#/products"], ["Send the page for review", b.pageStatus === "submitted" || b.pageStatus === "approved", "#/page"],
  ];
  put(root,
    h("h1", {}, b.live?.name || b.draft.name),
    b.pageStatus === "rejected" ? h("div", { class: "banner bad" }, h("b", {}, "Changes needed: "), b.pageNote || "") : null,
    b.pageStatus === "submitted" ? h("div", { class: "banner" }, "Your page is with our team. You will be notified when it is approved.") : null,
    b.pageStatus === "approved" && unsent ? h("div", { class: "banner" }, "You have changes that customers cannot see yet. Open Brand page and send them for review.") : null,
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("b", {}, pending.total), h("span", {}, "New orders to prepare")),
      h("div", { class: "stat" }, h("b", {}, all.total), h("span", {}, "Orders in total")),
      h("div", { class: "stat" }, h("b", {}, live), h("span", {}, "Products live")),
      h("div", { class: "stat" }, h("b", {}, review), h("span", {}, "Products in review"))),
    h("div", { class: "card" }, h("div", { class: "row between" }, h("h2", {}, "Your page"), h("span", { class: `badge ${tone}` }, label)),
      h("ul", { class: "check" }, steps.map(([t, done, href]) => h("li", { class: done ? "done" : "" }, h("span", { class: "tick" }, done ? "✓" : ""), h("a", { href }, t))))));
}
const strip = (c) => c && { ...c, collections: c.collections };
