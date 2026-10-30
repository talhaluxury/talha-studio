export type ChatSender = "customer" | "store";
export interface ChatMsg { seq: number; id: string; customerId: string; sender: ChatSender; body: string; imageKey: string | null; createdAt: Date; readAt: Date | null }
export interface Conversation { customerId: string; last: ChatMsg; unread: number }

/** One conversation per customer with the store. `seq` is a monotonic cursor so clients can poll "everything after N". */
export interface ChatStore {
  add(customerId: string, sender: ChatSender, body: string, imageKey: string | null): Promise<ChatMsg>;
  /** afterSeq null = the latest `limit` messages; otherwise messages newer than afterSeq. Always oldest-first. */
  list(customerId: string, afterSeq: number | null, limit: number): Promise<ChatMsg[]>;
  /** Marks the OTHER side's messages as read ("reader" is who opened the chat). Returns how many changed. */
  markRead(customerId: string, reader: ChatSender): Promise<number>;
  unreadForCustomer(customerId: string): Promise<number>;
  conversations(page: number, limit: number): Promise<{ items: Conversation[]; total: number; unreadTotal: number }>;
  /** Account deletion: removes the conversation and returns the image keys so the files can be deleted too. */
  deleteForCustomer(customerId: string): Promise<string[]>;
}
