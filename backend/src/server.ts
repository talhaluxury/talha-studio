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
import { createWhatsAppProvider, WhatsAppService } from "./whatsapp.js";
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
const email = new EmailService({ cfg, provider: createEmailProvider(cfg), emails, settings, orders, log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });

const pushStore = new PgPushStore(store.db);
const push = new PushService({ store: pushStore, sender: cfg.FCM_SERVICE_ACCOUNT_JSON ? new FcmSender(JSON.parse(cfg.FCM_SERVICE_ACCOUNT_JSON)) : new NullSender(), log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });

const whatsapp = new WhatsAppService({ cfg, provider: createWhatsAppProvider(cfg), store: new PgWhatsApp(store.db), log: { error: (o, m) => console.error(m, JSON.stringify(o)) } });
const catalog = new PgCatalog(store.db);
const assistant = new AssistantService({ cfg, llm: cfg.ANTHROPIC_API_KEY ? new AnthropicLLM(cfg.ANTHROPIC_API_KEY, cfg.ASSISTANT_MODEL) : noLLM, catalog, orders });

const app = await buildApp(cfg, { store, catalog, orders, whatsapp, assistant, storage: createStorage(cfg), emails, settings, email, push, pushStore, coupons: new PgCoupons(store.db), banners: new PgBanners(store.db), chat: new PgChat(store.db), slides: new PgSlides(store.db), status: new PgStatus(store.db) });
await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
if (!push.configured) app.log.warn("FCM_SERVICE_ACCOUNT_JSON is not set: push is off (the in-app notification inbox still works).");
if (!whatsapp.configured) app.log.warn("WHATSAPP_DRIVER is not configured: no WhatsApp welcome/order messages will be sent.");
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
