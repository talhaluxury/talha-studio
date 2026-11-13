import { PgSections } from "./sectionStore.js";
import { PgVideos } from "./videoStore.js";
import { PgSpin } from "./spinStore.js";
import { PgReels } from "./reelStore.js";
import { PgBrands } from "./pgBrands.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createEmailProvider } from "./emailProvider.js";
import { EmailService } from "./emailService.js";
import { PgCatalog } from "./pgCatalog.js";
import { PgEmailStore } from "./pgEmail.js";
import { PgOrders } from "./pgOrders.js";
import { PgStore } from "./pgStore.js";
import { PgBanners } from "./pgBanners.js";
import { PgCoupons } from "./pgCoupons.js";
import { PgChat } from "./pgChat.js";
import { PgSlides, PgStatus } from "./pgContent.js";
import { AnthropicLLM, AssistantService, noLLM } from "./assistant.js";
import { PgWhatsApp } from "./pgWhatsapp.js";
import { createWhatsAppProvider, WhatsAppService, type WhatsAppProvider } from "./whatsapp.js";
import { BaileysWhatsApp } from "./waQr.js";
import { PgPushStore } from "./pgPush.js";
import { PushService } from "./pushService.js";
import { FcmSender, NullSender } from "./pushSender.js";
import { PgSettings } from "./settingsStore.js";
import { createStorage } from "./storage.js";

const cfg = loadConfig();
const store = new PgStore(cfg.DATABASE_URL);
const orders = new PgOrders(store.db);
const emails = new PgEmailStore(store.db);
const settings = new PgSettings(store.db, { flat: cfg.SHIPPING_FLAT_PKR, freeOver: cfg.FREE_SHIPPING_OVER_PKR });
const storage = createStorage(cfg);
const email = new EmailService({ cfg, provider: createEmailProvider(cfg), emails, settings, orders, mediaUrl: (k) => storage.url(k), log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });

const pushStore = new PgPushStore(store.db);
const push = new PushService({ store: pushStore, sender: cfg.FCM_SERVICE_ACCOUNT_JSON ? new FcmSender(JSON.parse(cfg.FCM_SERVICE_ACCOUNT_JSON)) : new NullSender(), log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });

const catalog = new PgCatalog(store.db);
const assistant = new AssistantService({ cfg, llm: cfg.ANTHROPIC_API_KEY ? new AnthropicLLM(cfg.ANTHROPIC_API_KEY, cfg.ASSISTANT_MODEL) : noLLM, catalog, orders });
const waLog = { error: (o: object, m: string) => console.error(m, JSON.stringify(o)) };
const waQr = cfg.WHATSAPP_DRIVER === "qr" ? new BaileysWhatsApp({ pool: store.db, storeName: cfg.STORE_NAME, tpl: { welcome: cfg.WHATSAPP_TPL_WELCOME, order: cfg.WHATSAPP_TPL_ORDER, newArrival: cfg.WHATSAPP_TPL_NEW_ARRIVAL }, log: waLog }) : undefined;
const waProvider: WhatsAppProvider = waQr ?? createWhatsAppProvider(cfg);
const whatsapp = new WhatsAppService({ cfg, provider: waProvider, mediaUrl: (k) => storage.url(k), onConfirmed: (o) => push.orderConfirmed(o), store: new PgWhatsApp(store.db), inbound: { users: store, orders, assistant, aiEnabled: async () => (await settings.load()).aiReplies !== false }, log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });

const app = await buildApp(cfg, { brands: new PgBrands(store.db), store, catalog, orders, whatsapp, waQr, assistant, storage, emails, settings, email, push, pushStore, coupons: new PgCoupons(store.db), banners: new PgBanners(store.db), videos: new PgVideos(store.db), spin: new PgSpin(store.db), reels: new PgReels(store.db), sections: new PgSections(store.db), chat: new PgChat(store.db), slides: new PgSlides(store.db), status: new PgStatus(store.db) });
await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
if (waQr) { waQr.onMessage((from, text, id) => whatsapp.handleInbound(from, text, id)); void waQr.start(); }
if (!push.configured) app.log.warn("FCM_SERVICE_ACCOUNT_JSON is not set: push is off (the in-app notification inbox still works).");
if (!whatsapp.configured && !waQr) app.log.warn("WHATSAPP_DRIVER is not configured: no WhatsApp welcome/order messages will be sent.");
if (!assistant.enabled) app.log.warn("ANTHROPIC_API_KEY is not set: the in-app AI assistant is off.");
if (!email.configured) app.log.warn("EMAIL_DRIVER is not configured: order emails will wait in the queue until it is.");

// Email worker: flush any backlog on boot (e.g. after a free-tier host wakes up), then every 30 s.
void email.processDue();
const timer = setInterval(() => void email.processDue(), 30_000);
timer.unref();
// Drop device tokens that have not been seen for 90 days (hourly sweep).
const sweep = setInterval(() => void pushStore.pruneStale(90).catch(() => {}), 3600_000);
sweep.unref();

const stop = async () => { clearInterval(timer); await app.close(); await store.close(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
