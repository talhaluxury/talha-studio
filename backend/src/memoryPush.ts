import { randomUUID } from "node:crypto";
import { MAX_DEVICES_PER_USER, type CampaignRec, type NewNotification, type NotificationRec, type Prefs, type PushStore } from "./pushStore.js";
import type { MemoryStore } from "./memoryStore.js";

export class MemoryPushStore implements PushStore {
  devices: { userId: string; token: string; platform: string; seen: Date }[] = [];
  prefs = new Map<string, Prefs>(); inbox: NotificationRec[] = []; campaigns: CampaignRec[] = [];
  now = () => new Date();
  constructor(private users: MemoryStore) {}

  async upsertDevice(userId: string, token: string, platform: string) {
    const ex = this.devices.find((d) => d.token === token);
    if (ex) Object.assign(ex, { userId, platform, seen: this.now() }); else this.devices.push({ userId, token, platform, seen: this.now() });
    const mine = this.devices.filter((d) => d.userId === userId).sort((a, b) => b.seen.getTime() - a.seen.getTime());
    for (const old of mine.slice(MAX_DEVICES_PER_USER)) this.devices = this.devices.filter((d) => d !== old);
  }
  async removeDevice(userId: string, token: string) { this.devices = this.devices.filter((d) => !(d.userId === userId && d.token === token)); }
  async deleteTokens(tokens: string[]) { this.devices = this.devices.filter((d) => !tokens.includes(d.token)); }
  async pruneStale(days: number) { const before = this.devices.length; const cut = this.now().getTime() - days * 86400_000; this.devices = this.devices.filter((d) => d.seen.getTime() >= cut); return before - this.devices.length; }
  async tokensForUser(userId: string) { return this.devices.filter((d) => d.userId === userId).map((d) => d.token); }
  async getPrefs(userId: string) { return this.prefs.get(userId) ?? { orderUpdates: true, promotions: true }; }
  async setPrefs(userId: string, p: Partial<Prefs>) { const n = { ...(await this.getPrefs(userId)), ...p }; this.prefs.set(userId, n); return n; }

  async addNotification(userId: string, n: NewNotification) {
    const r: NotificationRec = { id: randomUUID(), userId, ...n, readAt: null, createdAt: this.now() }; this.inbox.unshift(r); return r;
  }
  async listNotifications(userId: string, page: number, limit: number) {
    const mine = this.inbox.filter((n) => n.userId === userId);
    return { items: mine.slice((page - 1) * limit, page * limit), total: mine.length, unread: mine.filter((n) => !n.readAt).length };
  }
  async unreadCount(userId: string) { return this.inbox.filter((n) => n.userId === userId && !n.readAt).length; }
  async markRead(userId: string, id: string) { const n = this.inbox.find((x) => x.id === id && x.userId === userId); if (!n) return false; n.readAt ??= this.now(); return true; }
  async markAllRead(userId: string) { let c = 0; for (const n of this.inbox) if (n.userId === userId && !n.readAt) { n.readAt = this.now(); c++; } return c; }

  private audience() { return [...this.users.users.values()].filter((u) => u.role === "customer" && u.isActive && !u.deletedAt && (this.prefs.get(u.id)?.promotions ?? true)); }
  async promoAudience() { const a = this.audience().map((u) => u.id); return { users: a.length, devices: this.devices.filter((d) => a.includes(d.userId)).length }; }
  async addPromoInbox(n: { title: string; body: string; deepLink: string | null }) { const a = this.audience(); for (const u of a) await this.addNotification(u.id, { ...n, kind: "promo" }); return a.length; }
  async promoTokens() { const a = new Set(this.audience().map((u) => u.id)); return this.devices.filter((d) => a.has(d.userId)).map((d) => d.token); }
  async createCampaign(c: { title: string; body: string; deepLink: string | null; createdBy: string }) {
    const r: CampaignRec = { id: randomUUID(), ...c, sentAt: null, recipients: null, failed: 0, createdAt: this.now() }; this.campaigns.unshift(r); return r;
  }
  async finishCampaign(id: string, r: { recipients: number; failed: number }) { const c = this.campaigns.find((x) => x.id === id)!; Object.assign(c, { sentAt: this.now(), ...r }); }
  async listCampaigns(page: number, limit: number) { return { items: this.campaigns.slice((page - 1) * limit, page * limit), total: this.campaigns.length }; }
  async hasRecentCampaign(title: string, body: string, sinceMs: number) { return this.campaigns.some((c) => c.title === title && c.body === body && this.now().getTime() - c.createdAt.getTime() < sinceMs); }
}
