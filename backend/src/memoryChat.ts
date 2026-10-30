import { randomUUID } from "node:crypto";
import type { ChatMsg, ChatSender, ChatStore, Conversation } from "./chatStore.js";

export class MemoryChat implements ChatStore {
  rows: ChatMsg[] = []; private seq = 0; now = () => new Date();
  async add(customerId: string, sender: ChatSender, body: string, imageKey: string | null) {
    const m: ChatMsg = { seq: ++this.seq, id: randomUUID(), customerId, sender, body, imageKey, createdAt: this.now(), readAt: null };
    this.rows.push(m); return m;
  }
  async list(customerId: string, afterSeq: number | null, limit: number) {
    const mine = this.rows.filter((m) => m.customerId === customerId);
    return afterSeq === null ? mine.slice(-limit) : mine.filter((m) => m.seq > afterSeq).slice(0, limit);
  }
  async markRead(customerId: string, reader: ChatSender) {
    let n = 0;
    for (const m of this.rows) if (m.customerId === customerId && m.sender !== reader && !m.readAt) { m.readAt = this.now(); n++; }
    return n;
  }
  async unreadForCustomer(customerId: string) { return this.rows.filter((m) => m.customerId === customerId && m.sender === "store" && !m.readAt).length; }
  async conversations(page: number, limit: number) {
    const last = new Map<string, ChatMsg>(); for (const m of this.rows) last.set(m.customerId, m);
    const all: Conversation[] = [...last.values()].sort((a, b) => b.seq - a.seq)
      .map((l) => ({ customerId: l.customerId, last: l, unread: this.rows.filter((m) => m.customerId === l.customerId && m.sender === "customer" && !m.readAt).length }));
    return { items: all.slice((page - 1) * limit, page * limit), total: all.length, unreadTotal: this.rows.filter((m) => m.sender === "customer" && !m.readAt).length };
  }
  async deleteForCustomer(customerId: string) {
    const keys = this.rows.filter((m) => m.customerId === customerId && m.imageKey).map((m) => m.imageKey!);
    this.rows = this.rows.filter((m) => m.customerId !== customerId); return keys;
  }
}
