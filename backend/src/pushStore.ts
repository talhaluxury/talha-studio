export type NotificationKind = "order" | "promo";
export interface NotificationRec { id: string; userId: string; title: string; body: string; deepLink: string | null; kind: NotificationKind; readAt: Date | null; createdAt: Date }
export interface Prefs { orderUpdates: boolean; promotions: boolean }
export interface CampaignRec { id: string; title: string; body: string; deepLink: string | null; createdBy: string | null; sentAt: Date | null; recipients: number | null; failed: number; createdAt: Date }
export interface NewNotification { title: string; body: string; deepLink: string | null; kind: NotificationKind }

export const MAX_DEVICES_PER_USER = 5;

export interface PushStore {
  upsertDevice(userId: string, token: string, platform: string): Promise<void>;     // reassigns the token if another account used this phone before
  removeDevice(userId: string, token: string): Promise<void>;
  deleteTokens(tokens: string[]): Promise<void>;                                      // invalid-token cleanup
  pruneStale(days: number): Promise<number>;
  tokensForUser(userId: string): Promise<string[]>;
  getPrefs(userId: string): Promise<Prefs>;
  setPrefs(userId: string, p: Partial<Prefs>): Promise<Prefs>;

  addNotification(userId: string, n: NewNotification): Promise<NotificationRec>;
  listNotifications(userId: string, page: number, limit: number): Promise<{ items: NotificationRec[]; total: number; unread: number }>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;

  promoAudience(): Promise<{ users: number; devices: number }>;
  addPromoInbox(n: Omit<NewNotification, "kind">): Promise<number>;                   // one inbox row per opted-in customer; returns count
  promoTokens(): Promise<string[]>;
  createCampaign(c: { title: string; body: string; deepLink: string | null; createdBy: string }): Promise<CampaignRec>;
  finishCampaign(id: string, r: { recipients: number; failed: number }): Promise<void>;
  listCampaigns(page: number, limit: number): Promise<{ items: CampaignRec[]; total: number }>;
  hasRecentCampaign(title: string, body: string, sinceMs: number): Promise<boolean>;
}
