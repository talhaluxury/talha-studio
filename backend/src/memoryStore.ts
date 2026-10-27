import { randomUUID } from "node:crypto";
import type { Address, NewAddress, NewUser, Role, Store, User } from "./store.js";

/** In-memory Store for tests and local experiments. Mirrors PgStore semantics. */
export class MemoryStore implements Store {
  users = new Map<string, User>();
  refresh = new Map<string, { userId: string; expiresAt: Date; revokedAt: Date | null }>();
  addresses = new Map<string, Address>();
  activity: unknown[] = [];

  async ping() {}
  async findUserByEmail(email: string) { return [...this.users.values()].find((u) => u.email === email.toLowerCase()) ?? null; }
  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async findUserByGoogleSub(sub: string) { return [...this.users.values()].find((u) => u.googleSub === sub) ?? null; }
  async createUser(n: NewUser) {
    const u: User = { id: randomUUID(), ...n, email: n.email.toLowerCase(), isActive: true, deletedAt: null, createdAt: new Date() };
    this.users.set(u.id, u); return u;
  }
  async updateUser(id: string, patch: Partial<User>) {
    const u = this.users.get(id)!; Object.assign(u, patch); return u;
  }
  async anonymiseUser(id: string) {
    const u = this.users.get(id)!;
    Object.assign(u, { email: `deleted+${id}@deleted.invalid`, fullName: "Deleted user", phone: null, passwordHash: null, googleSub: null, isActive: false, deletedAt: new Date() });
    for (const [k, a] of this.addresses) if (a.userId === id) this.addresses.delete(k);
  }
  async countCustomers() { return [...this.users.values()].filter((u) => u.role === "customer" && !u.deletedAt).length; }
  async listUsersByRoles(roles: Role[]) { return [...this.users.values()].filter((u) => roles.includes(u.role)); }

  async saveRefreshToken(t: { userId: string; tokenHash: string; expiresAt: Date }) { this.refresh.set(t.tokenHash, { userId: t.userId, expiresAt: t.expiresAt, revokedAt: null }); }
  async findRefreshToken(h: string) { return this.refresh.get(h) ?? null; }
  async revokeRefreshToken(h: string) { const r = this.refresh.get(h); if (r && !r.revokedAt) r.revokedAt = new Date(); }
  async revokeAllRefreshTokens(userId: string) { for (const r of this.refresh.values()) if (r.userId === userId && !r.revokedAt) r.revokedAt = new Date(); }

  async listAddresses(userId: string) { return [...this.addresses.values()].filter((a) => a.userId === userId); }
  async createAddress(userId: string, a: NewAddress) {
    if (a.isDefault) for (const x of this.addresses.values()) if (x.userId === userId) x.isDefault = false;
    const row: Address = { id: randomUUID(), userId, ...a }; this.addresses.set(row.id, row); return row;
  }
  async updateAddress(userId: string, id: string, a: Partial<NewAddress>) {
    const row = this.addresses.get(id); if (!row || row.userId !== userId) return null;
    if (a.isDefault) for (const x of this.addresses.values()) if (x.userId === userId) x.isDefault = false;
    Object.assign(row, a); return row;
  }
  async deleteAddress(userId: string, id: string) {
    const row = this.addresses.get(id); if (!row || row.userId !== userId) return false;
    return this.addresses.delete(id);
  }
  async logActivity(e: any) { this.activity.push({ id: randomUUID(), createdAt: new Date(), ...e }); }
  async listActivity(page: number, limit: number, action?: string) {
    const rows = (this.activity as any[]).filter((a) => !action || a.action.startsWith(action)).reverse();
    return { total: rows.length, items: rows.slice((page - 1) * limit, page * limit).map((a) => { const u = a.adminId ? this.users.get(a.adminId) : undefined;
      return { id: a.id, adminName: u?.fullName ?? null, adminEmail: u?.email ?? null, action: a.action, entity: a.entity ?? null, entityId: a.entityId ?? null, meta: a.meta ?? null, ip: a.ip ?? null, createdAt: a.createdAt }; }) };
  }
}
