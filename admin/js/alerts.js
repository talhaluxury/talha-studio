import { api, session } from "./api.js";
import { h, money, toast } from "./ui.js";

/**
 * New-order alerts inside the admin app / page:
 *  - a red count on the Orders menu item (orders still Pending),
 *  - a banner + beep + vibration the moment a new order arrives (checked every 20 seconds while the app is open),
 *  - a phone notification when the app is in the background (Android app),
 *  - the Android app also registers for real push so alerts arrive when the app is closed (needs Firebase, see docs).
 */
const bridge = () => { try { return window.TalhaWA && window.TalhaWA.available() ? window.TalhaWA : null; } catch { return null; } };
const SEEN_KEY = "ts_orders_seen";
const POLL_MS = 20000;

let known = null;          // ids of the pending orders we have already seen
let pending = 0;
let timer = null;
let pushTimer = null;

export const getSeenAt = () => Number(localStorage.getItem(SEEN_KEY) || 0);
/** Call when the Orders list is opened: everything placed so far counts as seen. */
export const markOrdersSeen = () => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* storage may be blocked */ } };

/** Puts the pending count on the Orders menu link (called after every screen is drawn). */
export function paintBadge() {
  document.querySelectorAll('.nav a[href="#/orders"] .orderbadge').forEach((n) => n.remove());
  if (pending > 0) document.querySelectorAll('.nav a[href="#/orders"]').forEach((a) => a.append(h("span", { class: "navbadge orderbadge", "aria-label": `${pending} pending orders` }, pending > 99 ? "99+" : String(pending))));
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    const ctx = new Ctx(); const now = ctx.currentTime;
    [[880, 0], [1175, 0.18], [1568, 0.36]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, now + t); g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16); o.start(now + t); o.stop(now + t + 0.18);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* sound is a bonus */ }
}

function announce(o) {
  const text = `${o.customerName} · ${money(o.total)} · ${o.itemCount} item${o.itemCount === 1 ? "" : "s"}`;
  const banner = h("a", { class: "neworder", href: `#/orders/${o.id}`, role: "alert" }, h("b", {}, `New order ${o.orderNumber}`), h("span", {}, text), h("small", {}, "Tap to open"));
  banner.addEventListener("click", () => banner.remove());
  document.body.append(banner); setTimeout(() => banner.remove(), 15000);
  beep(); try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
  const N = bridge(); if (N && document.hidden) { try { N.showNotification(`New order ${o.orderNumber}`, text, `admin://orders/${o.id}`); } catch { /* ignore */ } }
}

async function tick() {
  if (!session.get()) return;
  try {
    const r = await api("/admin/orders?status=pending&limit=20");
    if (known) r.items.filter((o) => !known.has(o.id)).reverse().forEach(announce);
    known = new Set(r.items.map((o) => o.id)); pending = r.total; paintBadge();
  } catch { /* offline or signed out: try again next time */ }
}

/** Real push for the Android app: send this phone's Firebase token to the server (once per token). */
function registerPush() {
  const N = bridge(); if (!N || pushTimer) return;
  let tries = 0;
  pushTimer = setInterval(async () => {
    tries++;
    let tok = ""; try { tok = N.pushToken(); } catch { /* old app build */ }
    if (tok) {
      clearInterval(pushTimer);
      if (localStorage.getItem("ts_push_tok") !== tok) {
        try { await api("/admin/devices", { method: "POST", body: { fcmToken: tok } }); localStorage.setItem("ts_push_tok", tok); } catch { /* retried at next sign-in */ }
      }
    } else if (tries > 20) clearInterval(pushTimer);
  }, 3000);
}

/** Starts watching (safe to call on every screen; it only starts once). */
export function startOrderAlerts() {
  if (timer || !session.get()) return;
  tick(); timer = setInterval(tick, POLL_MS); registerPush();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}

/** Sign-out: stop watching and stop pushes to this phone. */
export async function stopOrderAlerts() {
  clearInterval(timer); timer = null; clearInterval(pushTimer); pushTimer = null; known = null; pending = 0;
  const tok = localStorage.getItem("ts_push_tok");
  if (tok) { try { await api("/admin/devices/unregister", { method: "POST", body: { fcmToken: tok } }); } catch { /* best effort */ } localStorage.removeItem("ts_push_tok"); }
}

/** After the admin changes an order, refresh the count right away. */
export const refreshAlerts = () => tick();
