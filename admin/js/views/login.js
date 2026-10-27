import { api, session } from "../api.js";
import { h } from "../ui.js";

export function renderLogin(onDone) {
  const err = h("div", { class: "err", role: "alert" });
  const email = h("input", { id: "email", type: "email", autocomplete: "username", required: true, placeholder: "admin@yourstore.com" });
  const pw = h("input", { id: "pw", type: "password", autocomplete: "current-password", required: true, minlength: 1 });
  const btn = h("button", { class: "btn gold", type: "submit" }, "Sign in");
  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    if (!email.value.trim() || !pw.value) { err.textContent = "Enter your email and password."; return; }
    btn.disabled = true; btn.textContent = "Signing in...";
    try {
      const r = await api("/admin/auth/login", { method: "POST", auth: false, body: { email: email.value.trim(), password: pw.value } });
      session.set({ accessToken: r.accessToken, user: r.user, at: Date.now() });
      pw.value = ""; onDone();
    } catch (ex) {
      err.textContent = ex.status === 429 ? "Too many attempts. Wait a minute and try again." : ex.message;
      btn.disabled = false; btn.textContent = "Sign in";
    }
  } },
    h("img", { class: "logo", src: "icons/icon-192.png", alt: "Talha Studio" }),
    h("h1", {}, "TALHA"), h("p", { class: "sub" }, "STUDIO ADMIN"),
    err,
    h("div", { class: "field" }, h("label", { for: "email" }, "Email address"), email),
    h("div", { class: "field" }, h("label", { for: "pw" }, "Password"), pw),
    btn);
  return h("div", { class: "login" }, form);
}
