import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../errors.js";
import { verifyAccessToken, type Audience } from "../security.js";
import { STAFF_ROLES, type Role, type Store, type User } from "../store.js";

declare module "fastify" {
  interface FastifyRequest { user?: User }
}

/** Verifies the bearer token, then re-reads the user so deactivation/role changes apply immediately. */
export function makeAuth(store: Store, secret: string) {
  const authenticate = (aud: Audience) => async (req: FastifyRequest, _reply: FastifyReply) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) throw unauthorized();
    const claims = verifyAccessToken(secret, h.slice(7));
    if (!claims || claims.aud !== aud) throw unauthorized("Invalid or expired token");
    const user = await store.findUserById(claims.sub);
    if (!user || !user.isActive || user.deletedAt) throw unauthorized("Account unavailable");
    if (aud === "admin" && !STAFF_ROLES.includes(user.role)) throw forbidden();
    req.user = user;
  };
  const requireRole = (...roles: Role[]) => async (req: FastifyRequest) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
  };
  /** Signed-in customers get req.user; anyone else (or a bad token) simply continues anonymously. */
  const optionalCustomer = async (req: FastifyRequest, reply: FastifyReply) => { if (req.headers.authorization?.startsWith("Bearer ")) await authenticate("customer")(req, reply).catch(() => {}); };
  return { optionalCustomer, customer: authenticate("customer"), admin: authenticate("admin"), requireRole };
}
