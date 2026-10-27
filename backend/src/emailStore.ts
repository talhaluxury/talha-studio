export type EmailKind = "order_confirmation" | "owner_new_order" | "status_update" | "owner_status_alert";
export type EmailStatus = "queued" | "sent" | "failed";
export interface EmailLog {
  id: string; orderId: string | null; kind: EmailKind; toEmail: string; dedupeKey: string; status: EmailStatus;
  attempts: number; nextAttemptAt: Date; providerMessageId: string | null; providerState: string | null;
  lastError: string | null; subject: string | null; createdAt: Date; sentAt: Date | null;
}
export interface NewEmail { orderId: string; kind: EmailKind; toEmail: string; dedupeKey: string; failedReason?: string }
export interface EmailFilter { status?: EmailStatus; page: number; limit: number }

export interface EmailStore {
  /** Inserts once per dedupeKey. Returns false when it already existed (duplicate prevention). */
  enqueue(e: NewEmail): Promise<boolean>;
  /** Atomically claims due rows: attempts+1 and a 5-minute visibility timeout so concurrent workers never double-send. */
  claimDue(limit: number): Promise<EmailLog[]>;
  markSent(id: string, messageId: string | null, subject: string): Promise<void>;
  markRetry(id: string, error: string, nextAt: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  retry(id: string): Promise<boolean>;
  get(id: string): Promise<EmailLog | null>;
  list(f: EmailFilter): Promise<{ items: EmailLog[]; total: number }>;
  setProviderState(messageId: string, state: string, error?: string): Promise<boolean>;
  counts(): Promise<{ queued: number; failed: number }>;
  /** Emails created for this address recently (abuse guard: nobody can use the store to spam a third party). */
  countRecentTo(email: string, sinceMs: number): Promise<number>;
}
export const MAX_ATTEMPTS = 6;
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];   // after attempt 1..5
