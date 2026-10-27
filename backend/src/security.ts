import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "./store.js";

export type Audience = "customer" | "admin";
export interface TokenClaims { sub: string; role: Role; aud: Audience }

export const hashPassword = (p: string) => argon2.hash(p, { type: argon2.argon2id });
export const verifyPassword = (hash: string, p: string) => argon2.verify(hash, p).catch(() => false);

const ISSUER = "talha-studio-api";
const TTL: Record<Audience, string> = { customer: "15m", admin: "60m" };

export function signAccessToken(secret: string, c: TokenClaims): string {
  return jwt.sign({ role: c.role }, secret, { subject: c.sub, audience: c.aud, issuer: ISSUER, expiresIn: TTL[c.aud] as jwt.SignOptions["expiresIn"], algorithm: "HS256" });
}
export function verifyAccessToken(secret: string, token: string): TokenClaims | null {
  try {
    const p = jwt.verify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] }) as jwt.JwtPayload;
    const aud = Array.isArray(p.aud) ? p.aud[0] : p.aud;
    if (!p.sub || (aud !== "customer" && aud !== "admin")) return null;
    return { sub: p.sub, role: p.role as Role, aud };
  } catch { return null; }
}

/** Refresh tokens are opaque random strings; only their SHA-256 is stored. */
export const newRefreshToken = () => randomBytes(48).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;
