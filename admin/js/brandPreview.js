import { h, money } from "./ui.js";

/**
 * Renders a brand page the way customers see it in the app: 3D tilting logo, parallax cover, then the seller's sections in order
 * (banner slider, video, text, products, photo gallery, highlights, space). Colours are never chosen by the seller; the app's light/dark
 * theme decides, so the preview takes a theme: renderBrandPage(content, products, { theme: "dark" | "light", scroller }).
 *   content  = the API shape from /admin/brands/:id (draft or live): { name, tagline, logoUrl, coverUrl, instagram, website, sections:[...] }
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

const title = (t) => (t ? h("h3", { class: "bp-title" }, t) : null);

/** Banner slider: scroll-snap strip, dots, and it moves on by itself while it is on screen. */
function banner(sec, productName) {
  const slides = sec.slides || [];
  if (!slides.length) return h("p", { class: "bp-empty" }, "Banner has no pictures");
  const strip = h("div", { class: "bp-slides" }, slides.map((sl) => h("div", { class: "bp-slide" },
    h("img", { src: sl.image?.url || "", alt: sl.title || "" }),
    sl.title || sl.subtitle || sl.buttonLabel ? h("div", { class: "bp-slide-text" },
      sl.title ? h("b", {}, sl.title) : null, sl.subtitle ? h("span", {}, sl.subtitle) : null,
      sl.buttonLabel && sl.productId ? h("em", {}, sl.buttonLabel, productName(sl.productId) ? ` → ${productName(sl.productId)}` : "") : null) : null)));
  const dots = h("div", { class: "bp-dots" }, slides.map(() => h("i", {})));
  const mark = () => { const i = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)); [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i)); };
  strip.addEventListener("scroll", mark, { passive: true });
  queueMicrotask(mark);
  if (slides.length > 1 && !reduce()) {
    const t = setInterval(() => {
      if (!strip.isConnected) return clearInterval(t);
      const i = (Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth)) + 1) % slides.length;
      strip.scrollTo({ left: i * strip.clientWidth, behavior: "smooth" });
    }, 4500);
  }
  return h("div", { class: "bp-banner" }, strip, slides.length > 1 ? dots : null);
}

function productsBlock(sec, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const list = (sec.productIds?.length ? sec.productIds.map((id) => byId.get(id)).filter(Boolean) : products.filter((p) => p.state !== "archived").slice(0, 12));
  if (!list.length) return h("p", { class: "bp-empty" }, "No products to show here yet");
  return h("div", { class: `bp-prod bp-prod-${sec.layout || "grid"}` }, list.map(productCard));
}

function sectionEl(sec, products) {
  const productName = (id) => products.find((p) => p.id === id)?.name;
  let body;
  switch (sec.type) {
    case "banner": body = banner(sec, productName); break;
    case "video": {
      const v = h("video", { src: sec.video?.url, controls: true, playsinline: true, loop: !!sec.autoplay, autoplay: !!sec.autoplay, preload: "metadata" });
      v.muted = true;                                          // setting it as a property is what browsers honour for autoplay
      body = h("div", { class: "bp-video" }, title(sec.title), v, sec.caption ? h("p", { class: "bp-muted" }, sec.caption) : null); break;
    }
    case "text": body = h("div", { class: `bp-text${sec.align === "center" ? " c" : ""}` }, sec.heading ? h("h2", {}, sec.heading) : null, sec.body ? h("p", {}, sec.body) : null); break;
    case "products": body = h("div", {}, title(sec.title), productsBlock(sec, products)); break;
    case "gallery": body = h("div", {}, title(sec.title), h("div", { class: "bp-gallery" }, (sec.images || []).map((im) => tilt(h("img", { src: im.url, alt: "", loading: "lazy" }), 8)))); break;
    case "features": body = h("div", {}, title(sec.title), h("ul", { class: "bp-chips left" }, (sec.items || []).map((x) => h("li", {}, "✓ " + x)))); break;
    case "spacer": body = h("div", { class: `bp-space ${sec.size || "medium"}` }); break;
    default: return null;
  }
  return h("section", { class: `bp-sec${sec.hidden ? " hidden" : ""}` }, sec.hidden ? h("span", { class: "bp-hiddenlabel" }, "Hidden: will not show to customers") : null, body);
}

export function renderBrandPage(content, products, opts = {}) {
  const root = h("div", { class: `bp${opts.theme === "light" ? " bp-light" : ""}` });
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
      links.length ? h("div", { class: "bp-links" }, links) : null));
  const secs = (content.sections || []).map((s) => sectionEl(s, products)).filter(Boolean);
  root.append(hero, ...(secs.length ? secs : [h("p", { class: "bp-empty" }, "No sections yet")]));

  // Parallax: the cover drifts slower than the content when the page scrolls.
  const scroller = opts.scroller;
  if (scroller && !reduce()) scroller.addEventListener("scroll", () => root.style.setProperty("--py", String(scroller.scrollTop)), { passive: true });
  return root;
}
