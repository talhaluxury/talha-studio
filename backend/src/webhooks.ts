import { createHmac, timingSafeEqual } from "node:crypto";

/** Svix-style signature check (used by Resend webhooks). Rejects missing/old/forged requests. */
export function verifySvix(o: { secret: string; id?: string; timestamp?: string; signature?: string; body: string; nowMs?: number; toleranceSec?: number }): boolean {
  const { secret, id, timestamp, signature, body } = o;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp); const now = (o.nowMs ?? Date.now()) / 1000;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (o.toleranceSec ?? 300)) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signature.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const got = Buffer.from(sig);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
