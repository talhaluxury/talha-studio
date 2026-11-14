import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Store } from "../store.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SettingsStore } from "../settingsStore.js";
import type { WalletStore } from "../walletStore.js";

/** The offers the app advertises (0 = switched off) */
const offersOf = async (settings: SettingsStore) => {
  const w = (await settings.load()).wallet;
  return { signupBonus: w.signupBonus.active ? w.signupBonus.amount : 0, referralBonus: w.referral.active ? w.referral.amount : 0 };
};

export function walletRoutes(app: FastifyInstance, d: { wallet: WalletStore; settings: SettingsStore; store: Store; auth: ReturnType<typeof makeAuth> }) {
  const { wallet, settings, store, auth } = d;
  const manager = { preHandler: [auth.admin, auth.requireRole("admin", "owner")] };

  // Public: the sign-up screen shows these amounts, or skips itself when both offers are off.
  app.get("/offers", async () => offersOf(settings));

  app.get("/me/wallet", { preHandler: auth.customer }, async (req) => {
    const u = req.user!.id;
    const [balance, code, history, stats, offers] = await Promise.all([wallet.balance(u), wallet.referralCode(u), wallet.history(u, 50), wallet.referralStats(u), offersOf(settings)]);
    return { balance, referralCode: code, referralBonus: offers.referralBonus, friends: stats.friends, earnedFromReferrals: stats.earned,
      items: history.map((t) => ({ id: t.id, amount: t.amount, kind: t.kind, note: t.note, createdAt: t.createdAt })) };
  });

  // Owner/admin: switch the welcome bonus and the referral reward on or off and change the amounts. Money already given stays in wallets.
  app.get("/admin/wallet-offers", manager, async () => (await settings.load()).wallet);
  app.put("/admin/wallet-offers", manager, async (req) => {
    const side = z.object({ active: z.boolean(), amount: z.number().int().min(0).max(100000) });
    const b = z.object({ signupBonus: side, referral: side }).parse(req.body);
    const cur = await settings.load(); cur.wallet = b; await settings.save(cur);
    await store.logActivity({ adminId: req.user!.id, action: "wallet.offers", entity: "settings", meta: b, ip: req.ip });
    return cur.wallet;
  });
}
