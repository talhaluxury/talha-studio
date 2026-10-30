import type pg from "pg";
import type { ChatMsg, ChatSender, ChatStore } from "./chatStore.js";

type Row = Record<string, any>;
const toMsg = (r: Row): ChatMsg => ({ seq: Number(r.seq), id: r.id, customerId: r.customer_id, sender: r.sender, body: r.body, imageKey: r.image_key, createdAt: r.created_at, readAt: r.read_at });

export class PgChat implements ChatStore {
  constructor(private pool: pg.Pool) {}
  private q(t: string, v: unknown[] = []) { return this.pool.query(t, v as any[]); }
  async add(customerId: string, sender: ChatSender, body: string, imageKey: string | null) {
    return toMsg((await this.q("INSERT INTO chat_messages (customer_id, sender, body, image_key) VALUES ($1,$2,$3,$4) RETURNING *", [customerId, sender, body, imageKey])).rows[0]);
  }
  async list(customerId: string, afterSeq: number | null, limit: number) {
    const r = afterSeq === null
      ? await this.q("SELECT * FROM (SELECT * FROM chat_messages WHERE customer_id = $1 ORDER BY seq DESC LIMIT $2) t ORDER BY seq", [customerId, limit])
      : await this.q("SELECT * FROM chat_messages WHERE customer_id = $1 AND seq > $2 ORDER BY seq LIMIT $3", [customerId, afterSeq, limit]);
    return r.rows.map(toMsg);
  }
  async markRead(customerId: string, reader: ChatSender) {
    const other = reader === "customer" ? "store" : "customer";
    return (await this.q("UPDATE chat_messages SET read_at = now() WHERE customer_id = $1 AND sender = $2 AND read_at IS NULL", [customerId, other])).rowCount ?? 0;
  }
  async unreadForCustomer(customerId: string) {
    return Number((await this.q("SELECT count(*) AS n FROM chat_messages WHERE customer_id = $1 AND sender = 'store' AND read_at IS NULL", [customerId])).rows[0].n);
  }
  async conversations(page: number, limit: number) {
    const [list, total, unread] = await Promise.all([
      this.q(`WITH last AS (SELECT DISTINCT ON (customer_id) * FROM chat_messages ORDER BY customer_id, seq DESC),
                   unread AS (SELECT customer_id, count(*)::int AS n FROM chat_messages WHERE sender = 'customer' AND read_at IS NULL GROUP BY customer_id)
              SELECT l.*, COALESCE(u.n, 0) AS unread FROM last l LEFT JOIN unread u USING (customer_id) ORDER BY l.seq DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]),
      this.q("SELECT count(DISTINCT customer_id) AS n FROM chat_messages"),
      this.q("SELECT count(*) AS n FROM chat_messages WHERE sender = 'customer' AND read_at IS NULL"),
    ]);
    return { items: list.rows.map((r) => ({ customerId: r.customer_id as string, last: toMsg(r), unread: Number(r.unread) })), total: Number(total.rows[0].n), unreadTotal: Number(unread.rows[0].n) };
  }
  async deleteForCustomer(customerId: string) {
    return (await this.q("DELETE FROM chat_messages WHERE customer_id = $1 RETURNING image_key", [customerId])).rows.map((r) => r.image_key).filter(Boolean) as string[];
  }
}
