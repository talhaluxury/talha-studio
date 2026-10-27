import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, conflict, forbidden, unauthorized } from "../errors.js";
import {
  hashPassword, hashToken, newRefreshToken, REFRESH_TTL_MS, signAccessToken, verifyPassword,
} from "../security.js";
import { STAFF_ROLES, type Store, type User } from "../store.js";
import { FailureThrottle } from "../throttle.js";

export interface GoogleVerifier {
  verify(idToken: string): Promise<{ sub: string; email: string; emailVerified: boolean; name: string }>;
}

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, "At least 8 characters").max(128);
const phone = z.string().trim().regex(/^\+?[0-9 \-]{7,16}$/, "Invalid phone").optional();

export const publicUser = (u: User) => ({ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role });

// Real dummy hash so login timing is similar whether or not the email exists.
const DUMMY_P = hashPassword("not-a-real-password-for-timing");

export function authRoutes(app: FastifyInstance, d: { store: Store; secret: string; google: GoogleVerifier }) {
  const { store, secret, google } = d;
  const strict = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };
  const loginLock = new FailureThrottle(8, 15 * 60_000); const adminLock = new FailureThrottle(5, 15 * 60_000);

  async function issueCustomerTokens(user: User) {
    const refreshToken = newRefreshToken();
    await store.saveRefreshToken({ userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) });
    return { user: publicUser(user), accessToken: signAccessToken(secret, { sub: user.id, role: user.role, aud: "customer" }), refreshToken };
  }

  app.post("/auth/register", strict, async (req, reply) => {
    const b = z.object({ fullName: z.string().trim().min(2).max(100), email, password, phone }).parse(req.body);
    if (await store.findUserByEmail(b.email)) throw conflict("An account with this email already exists");
    const user = await store.createUser({
      email: b.email, passwordHash: await hashPassword(b.password), googleSub: null,
      fullName: b.fullName, phone: b.phone ?? null, role: "customer",
    });
    return reply.status(201).send(await issueCustomerTokens(user));
  });

  app.post("/auth/login", strict, async (req) => {
    const b = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    loginLock.check(b.email);
    const user = await store.findUserByEmail(b.email);
    const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY_P), b.password);
    if (!user || !ok || !user.isActive || user.deletedAt) { loginLock.fail(b.email); throw unauthorized("Incorrect email or password"); }
    loginLock.reset(b.email);
    // Staff must use the separate admin login; keeps customer and admin access distinct.
    if (STAFF_ROLES.includes(user.role)) throw forbidden("Use the admin panel to sign in");
    return issueCustomerTokens(user);
  });

  app.post("/auth/google", strict, async (req) => {
    const { idToken } = z.object({ idToken: z.string().min(20).max(4096) }).parse(req.body);
    let g;
    try { g = await google.verify(idToken); } catch { throw unauthorized("Google sign-in failed"); }
    if (!g.emailVerified) throw unauthorized("Google email is not verified");
    const mail = g.email.toLowerCase();
    let user = await store.findUserByGoogleSub(g.sub);
    if (!user) {
      const existing = await store.findUserByEmail(mail);
      if (existing) {
        if (STAFF_ROLES.includes(existing.role)) throw forbidden("Use the admin panel to sign in");
        user = await store.updateUser(existing.id, { googleSub: g.sub });
      } else {
        user = await store.createUser({ email: mail, passwordHash: null, googleSub: g.sub, fullName: g.name || mail.split("@")[0]!, phone: null, role: "customer" });
      }
    }
    if (!user.isActive || user.deletedAt) throw unauthorized("Account unavailable");
    return issueCustomerTokens(user);
  });

  // Rotation with reuse detection: replaying a used refresh token revokes every session of that user.
  app.post("/auth/refresh", strict, async (req) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20).max(200) }).parse(req.body);
    const h = hashToken(refreshToken);
    const row = await store.findRefreshToken(h);
    if (!row) throw unauthorized("Invalid refresh token");
    if (row.revokedAt) { await store.revokeAllRefreshTokens(row.userId); throw unauthorized("Session expired, please sign in again"); }
    if (row.expiresAt < new Date()) throw unauthorized("Session expired, please sign in again");
    const user = await store.findUserById(row.userId);
    if (!user || !user.isActive || user.deletedAt || STAFF_ROLES.includes(user.role)) throw unauthorized("Account unavailable");
    await store.revokeRefreshToken(h);
    return issueCustomerTokens(user);
  });

  app.post("/auth/logout", async (req, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().max(200) }).parse(req.body ?? {});
    await store.revokeRefreshToken(hashToken(refreshToken));
    return reply.status(204).send();
  });

  // Separate admin login: staff only, short-lived admin-audience token, no refresh token, extra-tight rate limit.
  app.post("/admin/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const b = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
    adminLock.check(b.email);
    const user = await store.findUserByEmail(b.email);
    const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY_P), b.password);
    if (!user || !ok || !user.isActive || user.deletedAt || !STAFF_ROLES.includes(user.role)) { adminLock.fail(b.email); throw unauthorized("Incorrect email or password"); }
    adminLock.reset(b.email);
    await store.logActivity({ adminId: user.id, action: "admin.login", ip: req.ip });
    return { user: publicUser(user), accessToken: signAccessToken(secret, { sub: user.id, role: user.role, aud: "admin" }), expiresInMinutes: 60 };
  });
}
export { AppError };
