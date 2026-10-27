import { AppError } from "./errors.js";

/**
 * Per-account failure throttle (on top of per-IP rate limits): after `max` failed attempts within `windowMs` the account is
 * locked for the rest of the window, even for the right password. This stops a distributed password-guessing attack on one account.
 * In-memory: correct for a single API instance (the free-tier deployment). Behind several instances, move it to the database.
 */
export class FailureThrottle {
  private m = new Map<string, { n: number; until: number; first: number }>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}
  /** Throws 429 if the key is locked. */
  check(key: string) {
    const e = this.m.get(key); const t = this.now();
    if (e && t - e.first > this.windowMs) { this.m.delete(key); return; }
    if (e && e.n >= this.max) throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many failed attempts. Please wait a few minutes and try again.");
  }
  fail(key: string) {
    const t = this.now(); const e = this.m.get(key);
    if (!e || t - e.first > this.windowMs) this.m.set(key, { n: 1, until: 0, first: t }); else e.n += 1;
    if (this.m.size > 10_000) for (const [k, v] of this.m) if (t - v.first > this.windowMs) this.m.delete(k);     // bounded memory
  }
  reset(key: string) { this.m.delete(key); }
}
