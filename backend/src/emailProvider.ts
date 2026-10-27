import type { Config } from "./config.js";

export interface OutgoingEmail { to: string; from: string; replyTo?: string; subject: string; html: string; text: string; idempotencyKey: string }
export interface SendResult { messageId: string | null }
/** Permanent = retrying cannot help (bad address, rejected content, bad credentials). */
export class EmailError extends Error { constructor(message: string, public permanent: boolean) { super(message); } }

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(m: OutgoingEmail): Promise<SendResult>;
}

export class NullProvider implements EmailProvider {
  name = "none"; configured = false;
  async send(): Promise<SendResult> { throw new EmailError("Email provider is not configured", false); }
}

/** Resend over HTTPS. The Idempotency-Key header makes a retry after a crash safe (no duplicate email). */
export class ResendProvider implements EmailProvider {
  name = "resend"; configured = true;
  constructor(private apiKey: string, private fetchImpl: typeof fetch = fetch) {}
  async send(m: OutgoingEmail): Promise<SendResult> {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
        body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
      });
    } catch (e) { throw new EmailError(`Could not reach Resend: ${(e as Error).message}`, false); }
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
    if (res.ok) return { messageId: body?.id ?? null };
    const msg = `Resend ${res.status}: ${body?.message ?? body?.name ?? "request failed"}`;
    // 4xx (except 408/409/429) means our request is wrong, so retrying will not help.
    throw new EmailError(msg, res.status >= 400 && res.status < 500 && ![408, 409, 429].includes(res.status));
  }
}

export class SmtpProvider implements EmailProvider {
  name = "smtp"; configured = true;
  constructor(private o: { host: string; port: number; user: string; pass: string }) {}
  async send(m: OutgoingEmail): Promise<SendResult> {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({ host: this.o.host, port: this.o.port, secure: this.o.port === 465, auth: this.o.user ? { user: this.o.user, pass: this.o.pass } : undefined, connectionTimeout: 15_000, socketTimeout: 30_000 });
    try {
      const info = await t.sendMail({ from: m.from, to: m.to, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, headers: { "X-Entity-Ref-ID": m.idempotencyKey } });
      return { messageId: info.messageId ?? null };
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode;
      throw new EmailError(`SMTP error: ${(e as Error).message}`, !!code && code >= 500 && code < 600);
    }
  }
}

export class MemoryEmailProvider implements EmailProvider {
  name = "memory"; configured = true; sent: OutgoingEmail[] = []; failWith: EmailError | null = null; private n = 0;
  async send(m: OutgoingEmail): Promise<SendResult> {
    if (this.failWith) throw this.failWith;
    if (this.sent.some((x) => x.idempotencyKey === m.idempotencyKey)) return { messageId: `mem-${this.sent.findIndex((x) => x.idempotencyKey === m.idempotencyKey)}` };   // provider-side dedupe
    this.sent.push(m); return { messageId: `mem-${this.n++}` };
  }
}

export function createEmailProvider(cfg: Config): EmailProvider {
  if (cfg.EMAIL_DRIVER === "resend") return new ResendProvider(cfg.RESEND_API_KEY);
  if (cfg.EMAIL_DRIVER === "smtp") return new SmtpProvider({ host: cfg.SMTP_HOST, port: cfg.SMTP_PORT, user: cfg.SMTP_USER, pass: cfg.SMTP_PASS });
  return new NullProvider();
}
