import { API_BASE } from "./config.js";
import { toast } from "./ui.js";

/**
 * Sign-in state. The short-lived access token lives only in memory; the refresh token (30 days, rotated on every use) is kept in
 * localStorage so a seller stays signed in on their phone. Sellers are ordinary customer accounts: the API decides who is a seller.
 */
const RK = "ts_seller_refresh"; const UK = "ts_seller_user";
let access = null; let refreshing = null;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } };

export const session = {
  signedIn() { return !!lsGet(RK); },
  user() { try { return JSON.parse(lsGet(UK)); } catch { return null; } },
  set(r) { access = r.accessToken; lsSet(RK, r.refreshToken); lsSet(UK, JSON.stringify(r.user)); },
  clear() { access = null; lsSet(RK, null); lsSet(UK, null); },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status === 0 ? "Cannot reach the server. Check your connection and try again." : "Request failed"));
    this.status = status; this.code = body?.error?.code; this.fields = body?.error?.fields || {};
  }
}

async function raw(path, { method = "GET", body, form, token }) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const slow = setTimeout(() => toast("The server is waking up. This can take up to a minute.", "ok"), 5000);
  let res;
  try { res = await fetch(API_BASE + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(70000) }); }
  catch { throw new ApiError(0, null); } finally { clearTimeout(slow); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

async function refresh() {
  // One refresh at a time: refresh tokens rotate, so a second parallel use of the same token would sign the seller out.
  refreshing ??= (async () => {
    const r = lsGet(RK); if (!r) throw new ApiError(401, { error: { message: "Please sign in" } });
    try { const d = await raw("/auth/refresh", { method: "POST", body: { refreshToken: r } }); session.set(d); }
    catch (e) { if (e.status === 401) session.clear(); throw e; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, opts = {}) {
  if (opts.auth === false) return raw(path, opts);
  if (!access) await refresh();
  try { return await raw(path, { ...opts, token: access }); }
  catch (e) {
    if (e.status !== 401) throw e;
    await refresh();
    return raw(path, { ...opts, token: access });
  }
}
/** Multipart upload (logo, cover, product pictures). */
export function upload(path, file) { const fd = new FormData(); fd.append("file", file); return api(path, { method: "POST", form: fd }); }

export async function signInWithGoogle(idToken) { const d = await raw("/auth/google", { method: "POST", body: { idToken } }); session.set(d); return d; }
export async function signInWithPassword(login, password) {
  const phone = !login.includes("@");
  const d = await raw(phone ? "/auth/phone/login" : "/auth/login", { method: "POST", body: phone ? { phone: login, password } : { email: login, password } });
  session.set(d); return d;
}
export async function signOut() {
  const r = lsGet(RK); session.clear();
  if (r) await raw("/auth/logout", { method: "POST", body: { refreshToken: r } }).catch(() => {});
}
