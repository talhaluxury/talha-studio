import { randomUUID } from "node:crypto";
import type { EmailFilter, EmailLog, EmailStore, NewEmail } from "./emailStore.js";

export class MemoryEmailStore implements EmailStore {
  rows: EmailLog[] = [];
  now = () => new Date();
  async enqueue(e: NewEmail) {
    if (this.rows.some((r) => r.dedupeKey === e.dedupeKey)) return false;
    const t = this.now();
    this.rows.unshift({ id: randomUUID(), orderId: e.orderId, kind: e.kind, toEmail: e.toEmail, dedupeKey: e.dedupeKey, status: e.failedReason ? "failed" : "queued", attempts: 0,
      nextAttemptAt: t, providerMessageId: null, providerState: null, lastError: e.failedReason ?? null, subject: null, createdAt: t, sentAt: null });
    return true;
  }
  async claimDue(limit: number) {
    const t = this.now(); const due = this.rows.filter((r) => r.status === "queued" && r.nextAttemptAt <= t).slice(0, limit);
    for (const r of due) { r.attempts += 1; r.nextAttemptAt = new Date(t.getTime() + 5 * 60_000); }
    return due.map((r) => ({ ...r }));
  }
  private row(id: string) { return this.rows.find((r) => r.id === id); }
  async markSent(id: string, messageId: string | null, subject: string) { const r = this.row(id)!; Object.assign(r, { status: "sent", providerMessageId: messageId, providerState: "accepted", subject, sentAt: this.now(), lastError: null }); }
  async markRetry(id: string, error: string, nextAt: Date) { Object.assign(this.row(id)!, { lastError: error, nextAttemptAt: nextAt }); }
  async markFailed(id: string, error: string) { Object.assign(this.row(id)!, { status: "failed", lastError: error }); }
  async retry(id: string) { const r = this.row(id); if (!r || r.status !== "failed") return false; Object.assign(r, { status: "queued", attempts: 0, nextAttemptAt: this.now(), lastError: null }); return true; }
  async get(id: string) { return this.row(id) ?? null; }
  async list(f: EmailFilter) { const r = this.rows.filter((x) => !f.status || x.status === f.status); return { items: r.slice((f.page - 1) * f.limit, f.page * f.limit), total: r.length }; }
  async setProviderState(messageId: string, state: string, error?: string) {
    const r = this.rows.find((x) => x.providerMessageId === messageId); if (!r) return false;
    if (state === "delayed" && ["delivered", "bounced", "complained"].includes(r.providerState ?? "")) return true;
    r.providerState = state; if (error) r.lastError = error; return true;
  }
  async countRecentTo(email: string, sinceMs: number) { return this.rows.filter((r) => r.toEmail.toLowerCase() === email.toLowerCase() && this.now().getTime() - r.createdAt.getTime() < sinceMs).length; }
  async counts() { return { queued: this.rows.filter((r) => r.status === "queued").length, failed: this.rows.filter((r) => r.status === "failed").length }; }
}
