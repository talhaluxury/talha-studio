export interface BannerRec {
  id: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaLink: string | null; imageKey: string | null;
  sortOrder: number; isActive: boolean; startsAt: Date | null; endsAt: Date | null;
}
export interface BannerInput { title: string; subtitle: string | null; ctaLabel: string | null; ctaLink: string | null; sortOrder: number; isActive: boolean; startsAt: Date | null; endsAt: Date | null }
export interface BannerStore {
  list(): Promise<BannerRec[]>;
  live(now: Date): Promise<BannerRec[]>;                                   // active + inside its date window, ordered
  get(id: string): Promise<BannerRec | null>;
  create(b: BannerInput): Promise<BannerRec>;
  update(id: string, b: BannerInput): Promise<BannerRec | null>;
  remove(id: string): Promise<{ removed: boolean; imageKey: string | null }>;
  setImage(id: string, key: string | null): Promise<{ ok: boolean; oldKey: string | null }>;
}
export const isLive = (b: BannerRec, now: Date) => b.isActive && (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt >= now);
