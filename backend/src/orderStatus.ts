export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refund_requested" | "refunded";
export const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refund_requested", "refunded"];

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refund_requested"],
  refund_requested: ["refunded", "delivered"],   // approve the refund, or reject the request (back to delivered)
  cancelled: [], refunded: [],
};
export const allowedNext = (s: OrderStatus) => NEXT[s];
export const canTransition = (from: OrderStatus, to: OrderStatus) => NEXT[from].includes(to);
/** Cancelling before shipment puts the reserved stock back on the shelf. */
export const restoresStock = (to: OrderStatus) => to === "cancelled";
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["pending", "confirmed"];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped", delivered: "Delivered",
  cancelled: "Cancelled", refund_requested: "Refund Requested", refunded: "Refunded",
};
