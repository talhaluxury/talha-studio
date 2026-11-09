import { api } from "./api.js";
import { toast } from "./ui.js";

/** One-click WhatsApp for an order: the customer's number, the product photo and the message are prepared; the admin only presses Send in WhatsApp. */
const STORE = "Talha Studio";
const PAY = { cod: "Cash on Delivery", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank transfer" };
const N = typeof window !== "undefined" ? window.TalhaWA : undefined; // Android admin app bridge (WhatsAppBridge.kt)
export const inApp = () => { try { return !!N && N.available(); } catch { return false; } };

/** Digits with country code (Pakistan default): 0300 1234567, 300-1234567 and +92 300 1234567 are the same number. Same rule as the server. */
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "92" + d.slice(1); else if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export const MESSAGE_KINDS = { confirm: "Ask customer to confirm order", confirmed: "Order confirmed", shipped: "Order shipped" };

export function orderMessage(o, kind = "confirm") {
  const first = (o.customer.name || "").trim().split(/\s+/)[0] || "there";
  const lines = o.items.slice(0, 5).map((i) => { const opt = [i.size, i.color].filter(Boolean).join(", "); return `• ${i.name}${opt ? ` (${opt})` : ""} x${i.qty}`; });
  if (o.items.length > 5) lines.push(`• aur ${o.items.length - 5} items`);
  const addr = [o.address.line1, o.address.line2, o.address.city, o.address.province, o.address.postalCode].filter(Boolean).join(", ");
  const total = `Rs ${Number(o.total).toLocaleString("en-US")} (${PAY[o.paymentMethod] ?? o.paymentMethod})`;
  if (kind === "confirmed") return `Assalam o Alaikum ${first}! 🌸\nAap ka order ${o.orderNumber} confirm ho gaya hai ✅\n\n🛍️ ${lines.join("\n")}\n\n💰 Total: ${total}\n\nHum isay jald dispatch karenge, shipping ki update yahin milti rahegi. ${STORE} se shopping ka bohat shukriya! 🌸`;
  if (kind === "shipped") return `Assalam o Alaikum ${first}! 🌸\nAap ka order ${o.orderNumber} dispatch ho gaya hai 🚚${o.trackingUrl ? `\n\nTracking: ${o.trackingUrl}` : ""}\n\nDelivery ke waqt rider is number par call karega: ${o.customer.phone}\n\n${STORE} se shopping ka bohat shukriya! 🌸`;
  return `Assalam o Alaikum ${first}! 🌸\nMain ${STORE} se hun. Aap ka order ${o.orderNumber} humein mil gaya hai, bohat shukriya!\n\n🛍️ Aap ka order:\n${lines.join("\n")}\n\n💰 Total: ${total}\n\n📍 Delivery address:\n${o.customer.name}, ${o.customer.phone}\n${addr}\n\n📞 Delivery ke waqt rider is number par aap ko call karega:\n${o.customer.phone}\n\nKindly confirm kar dein ke address aur ye number dono bilkul sahi hain.\n\nSab sahi hai to "YES" likh dein. Agar kuch galat hai to bas "galat hai" likh dein, hum yahin sahi address aur number note kar lenge.`;
}

export const firstImage = (o) => o.items.find((i) => i.imageUrl)?.imageUrl ?? null;
const chatUrl = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

/** Opens WhatsApp on this customer's chat with the message (and the product photo when `photo` is true). Nothing is sent until the admin presses Send. */
export async function sendWhatsApp(o, text, { photo = true } = {}) {
  const phone = normalizePhone(o.customer.phone);
  if (!phone) { toast(`"${o.customer.phone}" is not a valid phone number.`, "error"); return; }
  const img = photo ? firstImage(o) : null;
  if (inApp()) { try { img ? N.sharePhoto(phone, text, img) : N.open(phone, text); } catch { toast("Could not open WhatsApp.", "error"); } return; }
  if (img && navigator.canShare && navigator.share) { // phone browser / installed PWA: share sheet with the real photo, pick WhatsApp
    try {
      const blob = await (await fetch(img)).blob();
      const file = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e?.name === "AbortError") return; /* photo could not be fetched: fall back to a link */ }
  }
  window.open(chatUrl(phone, img ? `${text}\n\n${img}` : text), "_blank", "noopener");
}

/** List-page shortcut: load the order, then open WhatsApp with the standard confirmation. */
export async function quickWhatsApp(orderId, btn) {
  btn.disabled = true;
  try { const o = await api(`/admin/orders/${orderId}`); await sendWhatsApp(o, orderMessage(o, "confirm"), { photo: true }); }
  catch (e) { toast(e.message, "error"); } finally { btn.disabled = false; }
}
