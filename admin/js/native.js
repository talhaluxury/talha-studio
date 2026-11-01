// Bridge to the Android admin app's fingerprint vault (BiometricVault.kt). In a normal browser it reports "not available".
const N = typeof window !== "undefined" ? window.TalhaNative : undefined;
const waiting = new Map();
let seq = 0;

// Called by the Android app when a fingerprint prompt finishes.
window.__nativeDone = (id, ok, data) => {
  const p = waiting.get(id); if (!p) return;
  waiting.delete(id);
  ok ? p.resolve(data) : p.reject(new Error(data || "cancelled"));
};
const call = (fn) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); try { fn(id); } catch (e) { waiting.delete(id); reject(e); } });

export const bio = {
  /** True only inside the Android app on a phone with an enrolled fingerprint. */
  available: () => { try { return !!N && N.available(); } catch { return false; } },
  hasSaved: () => { try { return !!N && N.hasSaved(); } catch { return false; } },
  /** Asks for the fingerprint, then stores email+password encrypted by a key that only the fingerprint can unlock. */
  save: (email, password) => call((id) => N.save(id, JSON.stringify({ email, password }))),
  /** Asks for the fingerprint and resolves {email, password}. */
  load: () => call((id) => N.load(id)).then((s) => JSON.parse(s)),
  clear: () => { try { N?.clear(); } catch {} },
};
