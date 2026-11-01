import type pg from "pg";
import { normalizePhone } from "./phone.js";
import { WA_SPEED_GAP, type WaMedia, type WaSendOpts, type WaSpeed, type WhatsAppProvider } from "./whatsapp.js";

/**
 * WhatsApp through a normal WhatsApp / WhatsApp Business number linked by QR code (like WhatsApp Web), using Baileys.
 * Unofficial: Meta can ban a number that sends too many unwanted messages, so sends are queued with a random pause.
 * The login session lives in Postgres (Neon), so a Render restart does not need a new QR scan.
 */

export type QrState = "starting" | "qr" | "connecting" | "open" | "logged_out";
export interface QrStatus { state: QrState; qr: string | null; phone: string | null }

/** Baileys auth state kept in the database instead of files (Render's free disk is wiped on every restart). */
export async function usePgAuthState(pool: pg.Pool, b: { BufferJSON: any; initAuthCreds: () => any; proto: any }) {
  await pool.query("CREATE TABLE IF NOT EXISTS whatsapp_auth (key text PRIMARY KEY, value text NOT NULL)");
  const read = async (k: string) => {
    const r = await pool.query("SELECT value FROM whatsapp_auth WHERE key = $1", [k]);
    return r.rows[0] ? JSON.parse(r.rows[0].value, b.BufferJSON.reviver) : null;
  };
  const write = (k: string, v: unknown) => pool.query("INSERT INTO whatsapp_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [k, JSON.stringify(v, b.BufferJSON.replacer)]);
  const del = (k: string) => pool.query("DELETE FROM whatsapp_auth WHERE key = $1", [k]);
  const creds = (await read("creds")) ?? b.initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const out: Record<string, unknown> = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === "app-state-sync-key" && v) v = b.proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id] = v;
          }));
          return out;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          const jobs: Promise<unknown>[] = [];
          for (const [cat, items] of Object.entries(data)) for (const [id, v] of Object.entries(items ?? {})) jobs.push(v ? write(`${cat}-${id}`, v) : del(`${cat}-${id}`));
          await Promise.all(jobs);
        },
      },
    },
    saveCreds: () => write("creds", creds),
    clear: () => pool.query("DELETE FROM whatsapp_auth"),
  };
}

interface TemplateNames { welcome: string; order: string; newArrival: string }
interface Logger { error(o: object, m: string): void }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BaileysWhatsApp implements WhatsAppProvider {
  readonly name = "qr";
  private sock: any = null;
  private status: QrStatus = { state: "starting", qr: null, phone: null };
  private inbound: ((from: string, text: string, id: string) => Promise<void>) | null = null;
  private lanes: Record<"main" | "bulk", Promise<unknown>> = { main: Promise.resolve(), bulk: Promise.resolve() };
  private stopped = false;
  private lib: any = null;

  constructor(private d: { pool: pg.Pool; storeName: string; tpl: TemplateNames; log?: Logger }) {}

  /** Messages are only sent while the phone is linked. Nothing is claimed or queued otherwise. */
  get configured() { return this.status.state === "open"; }
  getStatus(): QrStatus { return { ...this.status }; }
  onMessage(cb: (from: string, text: string, id: string) => Promise<void>) { this.inbound = cb; }

  async start(): Promise<void> {
    this.stopped = false;
    try {
      this.lib ??= await import("@whiskeysockets/baileys");
      const QRCode = (await import("qrcode")).default;
      const pino = (await import("pino")).default;
      const L = this.lib; const makeWASocket = L.default?.default ?? L.default ?? L.makeWASocket;
      const auth = await usePgAuthState(this.d.pool, { BufferJSON: L.BufferJSON, initAuthCreds: L.initAuthCreds, proto: L.proto });
      let version: number[] | undefined; try { version = (await L.fetchLatestBaileysVersion()).version; } catch { /* use the library default */ }
      const logger = pino({ level: "silent" });
      // Cached key store (recommended by Baileys): avoids read/write races on the encryption keys, a cause of "Waiting for this message".
      const keys = typeof L.makeCacheableSignalKeyStore === "function" ? L.makeCacheableSignalKeyStore(auth.state.keys, logger) : auth.state.keys;
      const sock = makeWASocket({ version, auth: { creds: auth.state.creds, keys }, logger, browser: L.Browsers.ubuntu("Chrome"),
        printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
        // When a phone fails to decrypt a message it asks us to send it again. Without this it shows "Waiting for this message" forever.
        getMessage: async (key: { id?: string | null }) => (key.id ? this.sentCache.get(key.id) : undefined) });
      this.sock = sock;
      sock.ev.on("creds.update", () => { void auth.saveCreds().catch((e: unknown) => this.d.log?.error({ err: String(e) }, "whatsapp session save failed")); });
      sock.ev.on("connection.update", async (u: any) => {
        if (sock !== this.sock) return;
        if (u.qr) { this.status = { state: "qr", qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }), phone: null }; }
        if (u.connection === "connecting" && this.status.state !== "qr") this.status = { ...this.status, state: "connecting" };
        if (u.connection === "open") this.status = { state: "open", qr: null, phone: String(sock.user?.id ?? "").split(":")[0]?.split("@")[0] || null };
        if (u.connection === "close") {
          const code = u.lastDisconnect?.error?.output?.statusCode;
          this.status = { state: "starting", qr: null, phone: null };
          if (this.stopped) return;
          if (code === L.DisconnectReason.loggedOut) { await auth.clear(); this.status = { state: "logged_out", qr: null, phone: null }; await sleep(1500); void this.start(); return; }
          await sleep(code === L.DisconnectReason.restartRequired ? 200 : 4000); void this.start();
        }
      });
      sock.ev.on("messages.upsert", (ev: any) => {
        if (ev.type !== "notify") return;
        for (const m of ev.messages ?? []) {
          if (m.key?.fromMe || !m.message) continue;
          const jid: string = m.key.senderPn ?? m.key.remoteJidAlt ?? m.key.remoteJid ?? "";
          if (!jid.endsWith("@s.whatsapp.net")) continue;        // groups, broadcasts and unresolved @lid ids are ignored
          const text: string = m.message.conversation ?? m.message.extendedTextMessage?.text ?? "";
          if (!text || !m.key.id) continue;
          void this.inbound?.(jid.split("@")[0]?.split(":")[0] ?? "", text, m.key.id).catch((e) => this.d.log?.error({ err: String(e) }, "whatsapp inbound failed"));
        }
      });
    } catch (e) {
      this.d.log?.error({ err: String((e as Error).message ?? e) }, "whatsapp (qr) start failed, retrying in 30s");
      this.status = { state: "starting", qr: null, phone: null };
      if (!this.stopped) setTimeout(() => void this.start(), 30_000);
    }
  }

  /** Link without a QR code (for when the admin is open on the same phone): returns an 8 character code to type in WhatsApp > Linked devices > Link with phone number. */
  async pair(rawPhone: string): Promise<string> {
    const digits = normalizePhone(rawPhone);
    if (!digits) throw new Error("That phone number does not look right");
    if (this.status.state === "open") throw new Error("WhatsApp is already connected");
    for (let i = 0; i < 30 && this.status.state !== "qr"; i++) await sleep(500);
    if (this.status.state !== "qr" || !this.sock) throw new Error("WhatsApp is still starting. Try again in a few seconds.");
    const code = String(await this.sock.requestPairingCode(digits));
    return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
  }

  /** Unlinks the phone (it disappears from Linked devices) and shows a fresh QR code. */
  async logout(): Promise<void> {
    try { await this.sock?.logout(); } catch { /* already closed: the close handler resets the session */ }
  }

  /** One message at a time per lane with a random pause, like a person typing: this keeps the number from being flagged.
   *  New-product broadcasts get their own slower lane so an order confirmation never waits behind hundreds of promo messages. */
  private enqueue(jid: string, text: string, lane: "main" | "bulk" = "main", imageUrl?: string | null, speed: WaSpeed = "safe"): Promise<void> {
    const job = this.lanes[lane].then(async () => {
      if (!this.configured || !this.sock) throw new Error("WhatsApp is not linked. Scan the QR code in Admin > WhatsApp.");
      const [min, extra] = WA_SPEED_GAP[speed];
      await sleep(lane === "bulk" ? min + Math.floor(Math.random() * extra) : 1500 + Math.floor(Math.random() * 2500));
      const jpeg = imageUrl ? await this.jpegFrom(imageUrl) : null;      // no picture available: the text still goes out
      const sent = await this.sock.sendMessage(jid, jpeg ? { image: jpeg, caption: text } : { text });
      const id: string | undefined = sent?.key?.id;
      if (id && sent?.message) { this.sentCache.set(id, sent.message); if (this.sentCache.size > 500) this.sentCache.delete(this.sentCache.keys().next().value as string); }
    });
    this.lanes[lane] = job.catch(() => undefined);
    return job as Promise<void>;
  }
  /** Product pictures are stored as WebP; WhatsApp shows JPEG photos reliably, so convert (and keep the result for the whole broadcast). */
  private imgCache = new Map<string, Buffer>();
  /** Recently sent messages, so WhatsApp "please resend" requests can be answered. */
  private sentCache = new Map<string, unknown>();
  private async jpegFrom(url: string): Promise<Buffer | null> {
    const hit = this.imgCache.get(url); if (hit) return hit;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (!r.ok) return null;
      const sharp = (await import("sharp")).default;
      const out = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
      if (this.imgCache.size > 20) this.imgCache.clear();
      this.imgCache.set(url, out); return out;
    } catch (e) { this.d.log?.error({ err: String((e as Error).message ?? e) }, "whatsapp product image failed, sending text only"); return null; }
  }
  async sendText(to: string, text: string, opts?: WaSendOpts) { await this.enqueue(`${to}@s.whatsapp.net`, text, opts?.bulk ? "bulk" : "main", opts?.imageUrl ?? null, opts?.speed ?? "safe"); }

  /** The Cloud API sends approved templates; here the same templates are written out as plain text from their parameters (or the ready-made text in media.text). */
  async sendTemplate(to: string, template: string, _lang: string, p: string[], media?: WaMedia) {
    const { tpl, storeName } = this.d;
    let text: string | null = null; let lane: "main" | "bulk" = "main";
    if (template === tpl.welcome) text = `Assalam o Alaikum ${p[0]}! Welcome to ${p[1]}. Your account is ready. Ask us anything here on WhatsApp or in the app chat, we are happy to help.`;
    else if (template === tpl.order) text = `Hi ${p[0]}, thank you for your order ${p[1]} at ${p[2]}.\nTotal: Rs ${p[3]}\nDelivery city: ${p[4]}\n\nPlease reply YES to confirm your order. We will message you when it ships.`;
    else if (template === tpl.newArrival) { lane = "bulk"; text = `Hi ${p[0]}, new at ${p[3] ?? storeName}: ${p[1]} for Rs ${p[2]}.`; }
    text = media?.text ?? text;
    if (!text) throw new Error(`Unknown message type: ${template}`);
    await this.enqueue(`${to}@s.whatsapp.net`, text, lane, media?.imageUrl ?? null);
  }
}
