import type { OrderStatus } from "./orderStatus.js";
import type { OrderRec } from "./orderStore.js";

/** Side effects of order changes (email in Phase 6, push in Phase 7). Called AFTER the DB commit; failures never undo an order. */
export interface OrderEvents {
  orderPlaced(order: OrderRec): Promise<void>;
  statusChanged(order: OrderRec, previous: OrderStatus): Promise<void>;
}
export const noEvents: OrderEvents = { orderPlaced: async () => {}, statusChanged: async () => {} };

/** Runs every handler; one failing handler never blocks or fails the others. */
export function composeEvents(...handlers: OrderEvents[]): OrderEvents {
  const all = async (f: (h: OrderEvents) => Promise<void>) => { await Promise.allSettled(handlers.map(f)); };
  return { orderPlaced: (o) => all((h) => h.orderPlaced(o)), statusChanged: (o, p) => all((h) => h.statusChanged(o, p)) };
}
