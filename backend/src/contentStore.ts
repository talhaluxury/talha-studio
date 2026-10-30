/** Onboarding slides (the screens shown the first time the app opens) and 24-hour status pictures. */
export interface SlideRec { id: string; title: string; body: string; imageKey: string | null; sortOrder: number; isActive: boolean }
export interface SlideInput { title: string; body: string; sortOrder: number; isActive: boolean }
export interface SlideStore {
  list(): Promise<SlideRec[]>;
  live(): Promise<SlideRec[]>;                                              // active only, ordered
  get(id: string): Promise<SlideRec | null>;
  create(s: SlideInput): Promise<SlideRec>;
  update(id: string, s: SlideInput): Promise<SlideRec | null>;
  remove(id: string): Promise<{ removed: boolean; imageKey: string | null }>;
  setImage(id: string, key: string | null): Promise<{ ok: boolean; oldKey: string | null }>;
}

export const STATUS_TTL_MS = 24 * 3600 * 1000;
export interface StatusRec { id: string; imageKey: string; caption: string | null; createdAt: Date; expiresAt: Date }
export interface StatusStore {
  create(imageKey: string, caption: string | null, createdBy: string | null, expiresAt: Date): Promise<StatusRec>;
  live(now: Date): Promise<StatusRec[]>;                                    // not expired, newest first
  get(id: string): Promise<StatusRec | null>;
  remove(id: string): Promise<{ removed: boolean; imageKey: string | null }>;
  view(id: string, userId: string): Promise<void>;                          // idempotent
  viewCounts(ids: string[]): Promise<Map<string, number>>;
  /** Deletes statuses that expired before `now` and returns their image keys so the files can be removed. */
  purgeExpired(now: Date): Promise<string[]>;
}
