import { h, money } from "./ui.js";

/**
 * Renders a brand page exactly the way customers see it (3D tilting logo card, parallax cover, tilting product cards).
 * Used by the seller portal's live preview and by the admin panel's review screen. Keep js/preview.js (seller) and
 * js/brandPreview.js (admin) identical: they are the same file deployed to two websites.
 *   content  = { name, tagline, about, style, accent, logoUrl, coverUrl, highlights, instagram, website, collections:[{id,title,productIds}] }
 *   products = [{ id, name, price, salePrice, images:[{url,thumbUrl}], state? }]
 */
const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Pointer-driven 3D tilt with a moving highlight. Touch works too (drag). */
export function tilt(el, max = 12) {
  if (reduce()) return el;
  const move = (e) => {
    const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - y) * max * 2).toFixed(2)}deg`); el.style.setProperty("--ry", `${((x - 0.5) * max * 2).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(x * 100).toFixed(0)}%`); el.style.setProperty("--my", `${(y * 100).toFixed(0)}%`);
  };
  const reset = () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); };
  el.addEventListener("pointermove", move); el.addEventListener("pointerleave", reset); el.addEventListener("pointercancel", reset); el.addEventListener("pointerup", reset);
  el.classList.add("bp-tilt");
  return el;
}

const initials = (n) => (n || "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

function productCard(p) {
  const img = p.images?.[0];
  const card = h("article", { class: "bp-card" },
    h("div", { class: "bp-card-img" }, img ? h("img", { src: img.thumbUrl || img.url, alt: p.name, loading: "lazy" }) : h("span", { class: "bp-noimg" }, "No photo")),
    h("div", { class: "bp-card-body" },
      h("h4", {}, p.name),
      h("p", { class: "bp-price" }, p.salePrice ? [h("b", {}, money(p.salePrice)), h("s", {}, money(p.price))] : h("b", {}, money(p.price)))),
    p.state && p.state !== "approved" ? h("span", { class: "bp-state" }, p.state === "pending" ? "In review" : p.state === "rejected" ? "Rejected" : "Draft") : null);
  return tilt(card, 9);
}

export function renderBrandPage(content, products, opts = {}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const root = h("div", { class: `bp bp-${content.style || "noir"}`, style: `--accent:${/^#[0-9a-fA-F]{6}$/.test(content.accent) ? content.accent : "#B99A62"}` });
  const cover = h("div", { class: "bp-cover" }, content.coverUrl ? h("img", { src: content.coverUrl, alt: "" }) : null);
  const logo = tilt(h("div", { class: "bp-logo" },
    content.logoUrl ? h("img", { src: content.logoUrl, alt: `${content.name} logo` }) : h("span", {}, initials(content.name)),
    h("i", { class: "bp-glare" })), 16);
  const links = [
    content.instagram ? h("span", { class: "bp-link" }, "Instagram @" + content.instagram) : null,
    content.website ? h("span", { class: "bp-link" }, content.website.replace(/^https:\/\//, "")) : null,
  ].filter(Boolean);
  const hero = h("header", { class: "bp-hero" }, cover, h("div", { class: "bp-shade" }),
    h("div", { class: "bp-hero-in" }, logo,
      h("h1", {}, content.name || "Your brand"),
      content.tagline ? h("p", { class: "bp-tag" }, content.tagline) : null,
      h("span", { class: "bp-verified" }, "✓ Verified brand"),
      content.highlights?.length ? h("ul", { class: "bp-chips" }, content.highlights.map((x) => h("li", {}, x))) : null,
      links.length ? h("div", { class: "bp-links" }, links) : null));
  const about = content.about ? h("section", { class: "bp-about" }, h("h3", {}, "Our story"), h("p", {}, content.about)) : null;

  const groups = [{ id: "all", title: "All products", list: products.filter((p) => p.state !== "archived") }];
  for (const c of content.collections || []) {
    const list = c.productIds.map((id) => byId.get(id)).filter(Boolean);
    if (list.length) groups.push({ id: c.id, title: c.title, list });
  }
  const grid = h("div", { class: "bp-grid" });
  const tabs = h("nav", { class: "bp-tabs", "aria-label": "Collections" });
  const show = (g) => {
    grid.replaceChildren(...(g.list.length ? g.list.map(productCard) : [h("p", { class: "bp-empty" }, "No products yet")]));
    [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === g.id)));
  };
  for (const g of groups) tabs.append(h("button", { type: "button", "data-id": g.id, onclick: () => show(g) }, g.title));
  if (groups.length < 2) tabs.hidden = true;
  show(groups[0]);
  root.append(hero, about, tabs, grid);

  // Parallax: the cover drifts slower than the content when the page scrolls.
  const scroller = opts.scroller;
  if (scroller && !reduce()) scroller.addEventListener("scroll", () => root.style.setProperty("--py", String(scroller.scrollTop)), { passive: true });
  return root;
}
