import { api, session } from "../api.js";
import { h } from "../ui.js";
import { bio } from "../native.js";

const NO_AUTO = "ts_no_autologin"; // set on "Sign out" so the fingerprint prompt does not pop up straight away

export function renderLogin(onDone) {
  const err = h("div", { class: "err", role: "alert" });
  const email = h("input", { id: "email", type: "email", autocomplete: "username", required: true, placeholder: "admin@yourstore.com" });
  const pw = h("input", { id: "pw", type: "password", autocomplete: "current-password", required: true, minlength: 1 });
  const btn = h("button", { class: "btn gold", type: "submit" }, "Sign in");
  const canBio = bio.available();
  const remember = h("input", { id: "rem", type: "checkbox", checked: true });
  const rememberRow = canBio && !bio.hasSaved() ? h("label", { class: "row", style: "gap:8px;margin-bottom:16px;align-items:center" }, remember, "Fingerprint se login yaad rakho") : null;

  async function signIn(e, p, fromFingerprint) {
    const r = await api("/admin/auth/login", { method: "POST", auth: false, body: { email: e, password: p } }).catch((ex) => {
      // A saved password that no longer works (changed on the server) must not keep failing silently.
      if (fromFingerprint && ex.status === 401) { bio.clear(); throw new Error("Saved password purana ho gaya. Dobara password se login karein."); }
      throw ex;
    });
    session.set({ accessToken: r.accessToken, user: r.user, at: Date.now() });
    sessionStorage.removeItem(NO_AUTO);
  }

  async function fingerprintLogin() {
    err.textContent = ""; fpBtn && (fpBtn.disabled = true);
    try {
      const c = await bio.load();
      await signIn(c.email, c.password, true);
      onDone();
    } catch (ex) {
      if (ex.message === "invalidated") { bio.clear(); err.textContent = "Phone ki fingerprints badal gayi hain. Ek baar password se login karein."; }
      else if (!/cancel|negative|user|password se/i.test(ex.message) && ex.message !== "error") err.textContent = ex.message;
      fpBtn && (fpBtn.disabled = false);
    }
  }
  const fpBtn = canBio && bio.hasSaved() ? h("button", { class: "btn ghost", type: "button", onclick: fingerprintLogin }, "Fingerprint se login") : null;

  const form = h("form", { novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault(); err.textContent = "";
    if (!email.value.trim() || !pw.value) { err.textContent = "Enter your email and password."; return; }
    btn.disabled = true; btn.textContent = "Signing in...";
    try {
      await signIn(email.value.trim(), pw.value, false);
      if (rememberRow && remember.checked) {
        try { await bio.save(email.value.trim(), pw.value); } catch { /* fingerprint cancelled: just continue without saving */ }
      }
      pw.value = ""; onDone();
    } catch (ex) {
      err.textContent = ex.status === 429 ? "Too many attempts. Wait a minute and try again." : ex.message;
      btn.disabled = false; btn.textContent = "Sign in";
    }
  } },
    h("img", { class: "logo", src: "icons/icon-192.png", alt: "Talha Studio" }),
    h("h1", {}, "TALHA"), h("p", { class: "sub" }, "STUDIO ADMIN"),
    err,
    fpBtn,
    h("div", { class: "field" }, h("label", { for: "email" }, "Email address"), email),
    h("div", { class: "field" }, h("label", { for: "pw" }, "Password"), pw),
    rememberRow,
    btn,
    canBio && bio.hasSaved() ? h("button", { class: "btn ghost sm", type: "button", style: "margin-top:12px", onclick: () => { bio.clear(); location.reload(); } }, "Saved fingerprint login hatao") : null);

  // Saved login + fingerprint: ask for the fingerprint automatically (unless the user just signed out).
  if (fpBtn && !sessionStorage.getItem(NO_AUTO)) setTimeout(fingerprintLogin, 300);
  return h("div", { class: "login" }, form);
}
