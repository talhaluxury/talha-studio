import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import type { SettingsStore } from "./settingsStore.js";

export type WalletKind = "signup" | "referral_joined" | "referral_reward" | "order" | "refund" | "adjust";
export interface WalletTx { id: string; amount: number; kind: WalletKind; note: string; orderId: string | null; createdAt: Date }

/** Wallet ledger. The balance is always the sum of the ledger, so it can never drift from the history. */
export interface WalletStore {
  balance(userId: string): Promise<number>;
  history(userId: string, limit: number): Promise<WalletTx[]>;
  /** The person's own referral code (created the first time it is asked for). */
  referralCode(userId: string): Promise<string>;
  userIdByReferralCode(code: string): Promise<string | null>;
  setReferrer(userId: string, referrerId: string): Promise<void>;
  /** Adds money. Welcome / referral credits are given once only: returns false if that credit already exists. */
  credit(userId: string, amount: number, kind: WalletKind, note: string, refId?: string | null): Promise<boolean>;
  referralStats(userId: string): Promise<{ friends: number; earned: number }>;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newReferralCode = () => { const b = randomBytes(7); let s = "TS"; for (let i = 0; i < 6; i++) s += CODE_CHARS[b[i]! % CODE_CHARS.length]; return s; };
export const cleanCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Called once, right after a brand-new customer account is created. Never throws: the bonus must not break sign-up. */
export async function grantWelcome(wallet: WalletStore, settings: SettingsStore, userId: string, referralCode?: string | null) {
  try {
    const w = (await settings.load()).wallet;
    if (w.signupBonus.active && w.signupBonus.amount > 0) await wallet.credit(userId, w.signupBonus.amount, "signup", "Welcome bonus");
    const code = referralCode ? cleanCode(referralCode) : "";
    if (code && w.referral.active && w.referral.amount > 0) {
      const refId = await wallet.userIdByReferralCode(code);
      if (refId && refId !== userId) {
        await wallet.setReferrer(userId, refId);
        await wallet.credit(userId, w.referral.amount, "referral_joined", "Referral bonus: you joined with a friend's code", refId);
        await wallet.credit(refId, w.referral.amount, "referral_reward", "Referral bonus: a friend joined with your code", userId);
      }
    }
  } catch { /* best effort */ }
}

export class MemoryWallet implements WalletStore {
  tx = new Map<string, (WalletTx & { refId: string | null })[]>(); codes = new Map<string, string>(); referredBy = new Map<string, string>();
  private list(u: string) { let l = this.tx.get(u); if (!l) this.tx.set(u, l = []); return l; }
  async balance(u: string) { return this.list(u).reduce((a, t) => a + t.amount, 0); }
  async history(u: string, limit: number) { return [...this.list(u)].reverse().slice(0, limit); }
  async referralCode(u: string) { for (const [c, id] of this.codes) if (id === u) return c; let c = newReferralCode(); while (this.codes.has(c)) c = newReferralCode(); this.codes.set(c, u); return c; }
  async userIdByReferralCode(code: string) { return this.codes.get(cleanCode(code)) ?? null; }
  async setReferrer(u: string, r: string) { if (!this.referredBy.has(u)) this.referredBy.set(u, r); }
  async credit(u: string, amount: number, kind: WalletKind, note: string, refId: string | null = null) {
    const l = this.list(u);
    if (["signup", "referral_joined", "referral_reward"].includes(kind) && l.some((t) => t.kind === kind && t.refId === refId)) return false;
    l.push({ id: randomUUID(), amount, kind, note, orderId: null, createdAt: new Date(), refId }); return true;
  }
  async referralStats(u: string) { const r = this.list(u).filter((t) => t.kind === "referral_reward"); return { friends: r.length, earned: r.reduce((a, t) => a + t.amount, 0) }; }
}

export class PgWallet implements WalletStore {
  constructor(private pool: pg.Pool) {}
  async balance(u: string) { const r = await this.pool.query("SELECT COALESCE(sum(amount),0)::int AS b FROM wallet_transactions WHERE user_id = $1", [u]); return r.rows[0].b as number; }
  async history(u: string, limit: number) {
    const r = await this.pool.query("SELECT id, amount, kind, note, order_id, created_at FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2", [u, limit]);
    return r.rows.map((x) => ({ id: x.id, amount: x.amount, kind: x.kind, note: x.note, orderId: x.order_id, createdAt: x.created_at }));
  }
  async referralCode(u: string) {
    const cur = await this.pool.query("SELECT referral_code FROM users WHERE id = $1", [u]);
    if (cur.rows[0]?.referral_code) return cur.rows[0].referral_code as string;
    for (let i = 0; i < 8; i++) {
      try {
        const r = await this.pool.query("UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL RETURNING referral_code", [u, newReferralCode()]);
        if (r.rows[0]) return r.rows[0].referral_code as string;
        return (await this.pool.query("SELECT referral_code FROM users WHERE id = $1", [u])).rows[0].referral_code as string;   // set by a parallel request
      } catch (e: any) { if (e?.code !== "23505") throw e; }                                                                        // code already taken: try another
    }
    throw new Error("could not create a referral code");
  }
  async userIdByReferralCode(code: string) { const r = await this.pool.query("SELECT id FROM users WHERE referral_code = $1 AND is_active AND deleted_at IS NULL", [cleanCode(code)]); return r.rows[0]?.id ?? null; }
  async setReferrer(u: string, r: string) { await this.pool.query("UPDATE users SET referred_by = $2 WHERE id = $1 AND referred_by IS NULL", [u, r]); }
  async credit(u: string, amount: number, kind: WalletKind, note: string, refId: string | null = null) {
    const r = await this.pool.query("INSERT INTO wallet_transactions (user_id, amount, kind, note, ref_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [u, amount, kind, note, refId]);
    return (r.rowCount ?? 0) > 0;
  }
  async referralStats(u: string) {
    const r = await this.pool.query("SELECT count(*)::int AS n, COALESCE(sum(amount),0)::int AS s FROM wallet_transactions WHERE user_id = $1 AND kind = 'referral_reward'", [u]);
    return { friends: r.rows[0].n as number, earned: r.rows[0].s as number };
  }
}
