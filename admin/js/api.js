import { API_BASE } from "./config.js";
import { toast } from "./ui.js";

const KEY = "ts_admin_session";   // sessionStorage: cleared when the tab closes; token lives 60 min and is never refreshed
export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } },
  set(v) { sessionStorage.setItem(KEY, JSON.stringify(v)); },
  clear() { sessionStorage.removeItem(KEY); },
  canWrite() { const r = this.get()?.user?.role; return r === "admin" || r === "owner"; },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status === 0 ? "Cannot reach the server. Check your connection and try again." : "Request failed"));
    this.status = status; this.code = body?.error?.code; this.fields = body?.error?.fields || {};
  }
}
function expired() { session.clear(); location.hash = "#/login"; }

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const s = session.get();
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && s?.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
  // Free hosts sleep when idle; tell the user instead of looking frozen.
  const slow = setTimeout(() => toast("The server is waking up. This can take up to a minute.", "ok"), 5000);
  let res;
  try { res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(70000) }); }
  catch { throw new ApiError(0, null); } finally { clearTimeout(slow); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && auth) { expired(); }
    throw new ApiError(res.status, data);
  }
  return data;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export const uploadImage = (productId, file, onProgress) => uploadTo(`/admin/products/${productId}/images`, file, onProgress);
/** `fields` are plain text parts sent BEFORE the file (the server reads them together with it, e.g. a status caption). */
export function uploadTo(path, file, onProgress = () => {}, fields = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.get()?.accessToken ?? ""}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, null));
    xhr.ontimeout = () => reject(new ApiError(0, null));
    xhr.timeout = 120000;
    xhr.onload = () => {
      let data = null; try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) expired();
      xhr.status >= 200 && xhr.status < 300 ? resolve(data) : reject(new ApiError(xhr.status, data));
    };
    const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append("file", file);
    xhr.send(fd);
  });
}

/** Fetches a CSV with the bearer token. Browsers download it; the Android admin app (WebView cannot save blobs) shows it to copy. */
export async function fetchText(path) {
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${session.get()?.accessToken ?? ""}` } }).catch(() => { throw new ApiError(0, null); });
  if (res.status === 401) { expired(); throw new ApiError(401, null); }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.text();
}
