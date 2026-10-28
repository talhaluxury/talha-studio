import jwt from "jsonwebtoken";

export interface PushMessage { title: string; body: string; deepLink?: string | null; kind: "order" | "promo"; notificationId?: string }
/** invalidToken: the device token is dead (uninstalled/expired) and must be deleted. transient: worth retrying later. */
export class PushError extends Error { constructor(message: string, public invalidToken: boolean, public transient: boolean) { super(message); } }
export interface PushSender { readonly configured: boolean; readonly name: string; send(token: string, m: PushMessage): Promise<void> }

export class NullSender implements PushSender {
  configured = false; name = "none";
  async send(): Promise<void> { throw new PushError("Push is not configured", false, false); }
}

export interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Firebase Cloud Messaging HTTP v1 using a service account, with no Firebase SDK and no Cloud Functions,
 * so the Firebase project can stay on the free Spark plan. The service account lives only in a server secret.
 */
export class FcmSender implements PushSender {
  configured = true; name = "fcm";
  private cached: { token: string; exp: number } | null = null;
  constructor(private sa: ServiceAccount, private fetchImpl: typeof fetch = fetch, private nowMs: () => number = () => Date.now()) {}

  private async accessToken(force = false): Promise<string> {
    if (!force && this.cached && this.cached.exp - 60_000 > this.nowMs()) return this.cached.token;
    const iat = Math.floor(this.nowMs() / 1000); const uri = this.sa.token_uri ?? "https://oauth2.googleapis.com/token";
    const assertion = jwt.sign({ iss: this.sa.client_email, scope: SCOPE, aud: uri, iat, exp: iat + 3600 }, this.sa.private_key, { algorithm: "RS256" });
    let res: Response;
    try {
      res = await this.fetchImpl(uri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15_000),
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
    } catch (e) { throw new PushError(`Could not reach Google auth: ${(e as Error).message}`, false, true); }
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!res.ok || !body?.access_token) throw new PushError(`FCM auth failed (${res.status}): ${body?.error_description ?? "check the service account"}`, false, res.status >= 500);
    this.cached = { token: body.access_token, exp: this.nowMs() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  async send(token: string, m: PushMessage): Promise<void> {
    const payload = { message: {
      token, notification: { title: m.title, body: m.body },
      data: { kind: m.kind, ...(m.deepLink ? { deepLink: m.deepLink } : {}), ...(m.notificationId ? { notificationId: m.notificationId } : {}) },
      android: { priority: "HIGH", notification: { channel_id: m.kind === "order" ? "orders" : "promotions_hi" } },
    } };
    for (let attempt = 0; attempt < 2; attempt++) {
      const access = await this.accessToken(attempt > 0);
      let res: Response;
      try {
        res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
          method: "POST", signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch (e) { throw new PushError(`Could not reach FCM: ${(e as Error).message}`, false, true); }
      if (res.ok) return;
      if (res.status === 401 && attempt === 0) continue;                     // expired access token: refresh once and retry
      const err = ((await res.json().catch(() => null)) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null)?.error;
      const code = err?.details?.find((d) => d.errorCode)?.errorCode ?? err?.status ?? "";
      const dead = code === "UNREGISTERED" || res.status === 404 || code === "SENDER_ID_MISMATCH" || (code === "INVALID_ARGUMENT" && /registration token|not a valid FCM/i.test(err?.message ?? ""));
      throw new PushError(`FCM ${res.status} ${code}: ${err?.message ?? "request failed"}`, dead, !dead && (res.status === 429 || res.status >= 500));
    }
  }
}

export class MemorySender implements PushSender {
  configured = true; name = "memory"; sent: { token: string; m: PushMessage }[] = [];
  /** token -> error to throw */ failures = new Map<string, PushError>();
  async send(token: string, m: PushMessage) { const f = this.failures.get(token); if (f) throw f; this.sent.push({ token, m }); }
}
