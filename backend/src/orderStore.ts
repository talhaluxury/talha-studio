import type { PriceCfg, Issue } from "./pricing.js";
import type { OrderStatus } from "./orderStatus.js";

export interface OrderItemRec { productId: string | null; variantId: string | null; name: string; sku: string; size: string | null; color: string | null; unitPrice: number; qty: number; thumbKey: string | null }
export interface OrderRec {
  id: string; orderNumber: string; userId: string | null; status: OrderStatus; paymentMethod: "cod"; paymentStatus: "unpaid" | "paid" | "refunded";
  subtotal: number; discount: number; shipping: number; total: number; couponCode: string | null;
  customer: { name: string; email: string; phone: string };
  address: { line1: string; line2: string | null; city: string; province: string | null; postalCode: string | null };
  notes: string | null; trackingUrl: string | null; items: OrderItemRec[];
  history: { status: OrderStatus; note: string | null; at: Date }[]; createdAt: Date; updatedAt: Date;
}
export interface OrderSummary { id: string; orderNumber: string; status: OrderStatus; total: number; createdAt: Date; itemCount: number; firstItemName: string | null; firstThumbKey: string | null; customerName: string; customerPhone: string }
export interface NewOrderInput {
  userId: string; idempotencyKey: string; items: { variantId: string; qty: number }[];
  customer: OrderRec["customer"]; address: OrderRec["address"]; notes: string | null; cfg: PriceCfg; couponCode?: string | null; maxOpenOrders?: number;
}
export interface OrderFilter { status?: OrderStatus; q?: string; from?: string; to?: string; page: number; limit: number }
export interface Analytics {
  sales: number; orders: number; pending: number; customers: number;
  series: { date: string; orders: number; sales: number }[]; byStatus: Record<string, number>;
  topProducts: { name: string; qty: number; revenue: number }[];
}
export interface CustomerRow { id: string; fullName: string; email: string; phone: string | null; createdAt: Date; orders: number; spent: number }

export class OrderIssuesError extends Error { constructor(public issues: Issue[]) { super("cart issues"); } }
export class TransitionError extends Error {}
export class OpenOrdersLimitError extends Error {}
export const OPEN_STATUSES = ["pending", "confirmed", "processing"] as const;

export interface OrderStore {
  createOrder(i: NewOrderInput): Promise<{ order: OrderRec; created: boolean }>;
  listForUser(userId: string, page: number, limit: number): Promise<{ items: OrderSummary[]; total: number }>;
  getForUser(userId: string, id: string): Promise<OrderRec | null>;
  customerCancel(userId: string, id: string): Promise<OrderRec | null>;
  requestReturn(userId: string, id: string, reason: string, windowDays: number): Promise<OrderRec | null>;
  adminList(f: OrderFilter): Promise<{ items: OrderSummary[]; total: number }>;
  adminGet(id: string): Promise<OrderRec | null>;
  adminSetStatus(id: string, to: OrderStatus, note: string | null, trackingUrl: string | null, adminId: string): Promise<OrderRec | null>;
  adminExport(f: Omit<OrderFilter, "page" | "limit">): Promise<OrderRec[]>;
  adminCustomers(q: string | undefined, page: number, limit: number): Promise<{ items: CustomerRow[]; total: number }>;
  analytics(days: number, tz: string): Promise<Analytics>;
  exportForUser(userId: string): Promise<OrderRec[]>;
}
