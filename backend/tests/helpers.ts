import type { Config } from "../src/config.js";
import { EmailService } from "../src/emailService.js";
import { NullProvider, type EmailProvider } from "../src/emailProvider.js";
import { MemoryEmailStore } from "../src/memoryEmail.js";
import { MemoryBanners } from "../src/memoryBanners.js";
import { MemoryChat } from "../src/memoryChat.js";
import { MemorySlides, MemoryStatus } from "../src/memoryContent.js";
import { MemoryCoupons } from "../src/memoryCoupons.js";
import { MemoryPushStore } from "../src/memoryPush.js";
import { MemoryStore } from "../src/memoryStore.js";
import { PushService } from "../src/pushService.js";
import { NullSender, type PushSender } from "../src/pushSender.js";
import type { OrderStore } from "../src/orderStore.js";
import { MemorySettings } from "../src/settingsStore.js";

export const emailCfgFields = {
  EMAIL_DRIVER: "none" as const, EMAIL_FROM: "Talha Studio <orders@talha.test>", RESEND_API_KEY: "", RESEND_WEBHOOK_SECRET: "", SMTP_HOST: "", SMTP_PORT: 587, SMTP_USER: "", SMTP_PASS: "",
  CRON_SECRET: "", ADMIN_PUBLIC_URL: "", PUBLIC_LOGO_URL: "", STORE_NAME: "Talha Studio",
};
/** Email wiring for tests that do not care about email (provider not configured: rows just queue). */
export function emailDeps(orders: OrderStore, cfg: Config, provider: EmailProvider = new NullProvider(), now?: () => Date, users: MemoryStore = new MemoryStore(), sender: PushSender = new NullSender()) {
  const emails = new MemoryEmailStore(); const settings = new MemorySettings();
  if (now) emails.now = now;
  const email = new EmailService({ cfg, provider, emails, settings, orders, now });
  const pushStore = new MemoryPushStore(users); const push = new PushService({ store: pushStore, sender });
  return { emails, settings, email, push, pushStore, coupons: new MemoryCoupons(), banners: new MemoryBanners(), chat: new MemoryChat(), slides: new MemorySlides(), status: new MemoryStatus() };
}
