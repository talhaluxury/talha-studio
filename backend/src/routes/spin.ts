import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { DuplicateCoupon, type CouponStore } from "../couponStore.js";
import { AppError } from "../errors.js";
import type { makeAuth } from "../plugins/auth.js";
import type { SettingsStore } from "../settingsStore.js";
import type { SpinStore } from "../spinStore.js";

export const SPIN_COOLDOWN_MS = 24 * 3600_000;
const COUPON_DAYS = 3;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";     // no 0/O/1/I so a code is easy to read out and type
const newCode = () => "SPIN" + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Lucky wheel: one spin per signed-in customer per day. The prize is a single-use percent coupon that expires in a few days. */
export function spinRoutes(app: FastifyInstance, d: { spin: SpinStore; coupons: CouponStore; settings: SettingsStore; auth: ReturnType<typeof makeAuth> }) {
  const { spin, coupons, settings, auth } = d;
  const me = { preHandler: auth.customer };

  app.get("/me/spin", me, async (req) => {
    const st = await settings.load(); const last = await spin.lastSpin(req.user!.id); const now = Date.now();
    const next = last ? last.getTime() + SPIN_COOLDOWN_MS : 0;
    const active = st.spin.active && st.spin.percents.length > 0;
    return { active, percents: st.spin.percents, canSpin: active && next <= now, nextAt: next > now ? new Date(next).toISOString() : null };
  });

  app.post("/me/spin", { ...me, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const st = await settings.load();
    if (!st.spin.active || st.spin.percents.length === 0) throw new AppError(409, "SPIN_OFF", "The lucky wheel is not running right now");
    const userId = req.user!.id; const last = await spin.lastSpin(userId);
    if (last && last.getTime() + SPIN_COOLDOWN_MS > Date.now()) throw new AppError(429, "SPIN_WAIT", "You have already spun today. Come back tomorrow!");
    const index = randomInt(st.spin.percents.length); const percent = st.spin.percents[index]!;
    const endsAt = new Date(Date.now() + COUPON_DAYS * 24 * 3600_000);
    let code: string | null = null;
    for (let i = 0; i < 5 && !code; i++) {
      try { const c = await coupons.create({ code: newCode(), type: "percent", value: percent, minSubtotal: 0, maxUses: 1, startsAt: null, endsAt, isActive: true }); code = c.code; }
      catch (e) { if (!(e instanceof DuplicateCoupon)) throw e; }
    }
    if (!code) throw new AppError(500, "SPIN_FAILED", "Could not create your prize. Please try again");
    await spin.record(userId, percent, code);
    return { index, percent, code, expiresAt: endsAt.toISOString() };
  });
}
