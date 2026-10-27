export type Role = "customer" | "staff" | "admin" | "owner";
export const STAFF_ROLES: Role[] = ["staff", "admin", "owner"];

export interface User {
  id: string; email: string; passwordHash: string | null; googleSub: string | null;
  fullName: string; phone: string | null; role: Role; isActive: boolean; deletedAt: Date | null; createdAt: Date;
}
export interface Address {
  id: string; userId: string; label: string | null; recipient: string; phone: string;
  line1: string; line2: string | null; city: string; province: string | null; postalCode: string | null; isDefault: boolean;
}
export type NewUser = Pick<User, "email" | "passwordHash" | "googleSub" | "fullName" | "phone" | "role">;
export type NewAddress = Omit<Address, "id" | "userId">;

/** Data-access boundary. PgStore is production; MemoryStore powers fast tests. */
export interface ActivityRow { id: string; adminName: string | null; adminEmail: string | null; action: string; entity: string | null; entityId: string | null; meta: unknown; ip: string | null; createdAt: Date }

export interface Store {
  ping(): Promise<void>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByGoogleSub(sub: string): Promise<User | null>;
  createUser(u: NewUser): Promise<User>;
  updateUser(id: string, patch: Partial<Pick<User, "fullName" | "phone" | "googleSub" | "isActive" | "role" | "passwordHash">>): Promise<User>;
  anonymiseUser(id: string): Promise<void>;
  listUsersByRoles(roles: Role[]): Promise<User[]>;
  countCustomers(): Promise<number>;

  saveRefreshToken(t: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<{ userId: string; expiresAt: Date; revokedAt: Date | null } | null>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  revokeAllRefreshTokens(userId: string): Promise<void>;

  listAddresses(userId: string): Promise<Address[]>;
  createAddress(userId: string, a: NewAddress): Promise<Address>;
  updateAddress(userId: string, id: string, a: Partial<NewAddress>): Promise<Address | null>;
  deleteAddress(userId: string, id: string): Promise<boolean>;

  listActivity(page: number, limit: number, action?: string): Promise<{ items: ActivityRow[]; total: number }>;
  logActivity(e: { adminId: string | null; action: string; entity?: string; entityId?: string; meta?: unknown; ip?: string }): Promise<void>;
}
