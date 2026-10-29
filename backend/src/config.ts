import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be >= 32 chars"),
  GOOGLE_WEB_CLIENT_ID: z.string().default(""),
  ADMIN_ORIGIN: z.string().default(""),
  SHIPPING_FLAT_PKR: z.coerce.number().int().min(0).default(299),
  FREE_SHIPPING_OVER_PKR: z.coerce.number().int().min(0).default(0),   // 0 = free shipping disabled
  MAX_COD_ORDER_PKR: z.coerce.number().int().min(1000).default(200000),   // abuse/fraud guard for Cash on Delivery
  RETURN_WINDOW_DAYS: z.coerce.number().int().min(0).default(7),
  STORE_TIMEZONE: z.string().default("Asia/Karachi"),
  EMAIL_DRIVER: z.enum(["none", "resend", "smtp", "brevo"]).default("none"),
  EMAIL_FROM: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  BREVO_API_KEY: z.string().default(""),               // Brevo HTTPS API key (works on Render free: no SMTP port needed; sender = a verified single sender address)
  RESEND_WEBHOOK_SECRET: z.string().default(""),
  SMTP_HOST: z.string().default(""), SMTP_PORT: z.coerce.number().default(587), SMTP_USER: z.string().default(""), SMTP_PASS: z.string().default(""),
  CRON_SECRET: z.string().default(""),                 // lets an external pinger wake the API and flush the email queue
  ADMIN_PUBLIC_URL: z.string().default(""),            // used for "open in admin" links in the owner email
  PUBLIC_LOGO_URL: z.string().default(""),             // optional absolute https URL of the logo for emails
  STORE_NAME: z.string().default("Talha Studio"),
  FCM_SERVICE_ACCOUNT_JSON: z.string().default(""),     // full Firebase service-account JSON (host secret). Empty = push disabled, in-app inbox still works
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),   // how many reverse proxies sit in front (Render = 1; Cloudflare + Render = 2)
  MAX_OPEN_ORDERS_PER_USER: z.coerce.number().int().min(1).max(50).default(5),
  ALLOW_LOCAL_STORAGE: z.enum(["0", "1"]).default("0"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_MEDIA_DIR: z.string().default("./media"),
  PUBLIC_MEDIA_BASE_URL: z.string().default("http://localhost:4000/media"),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  ADMIN_BOOTSTRAP_EMAIL: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
});
export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    // Print variable names only, never values.
    const names = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${names}`);
  }
  const d = r.data;
  if (d.NODE_ENV === "production") {
    // Production must never run on ephemeral disk or plain HTTP: fail loudly at boot instead of losing data silently.
    const bad: string[] = [];
    if (d.STORAGE_DRIVER === "local" && d.ALLOW_LOCAL_STORAGE !== "1") bad.push("STORAGE_DRIVER=local loses images on redeploy; use s3 (or set ALLOW_LOCAL_STORAGE=1 for a persistent disk)");
    if (d.STORAGE_DRIVER === "s3" && !d.PUBLIC_MEDIA_BASE_URL.startsWith("https://")) bad.push("PUBLIC_MEDIA_BASE_URL must be https://");
    if (!d.ADMIN_ORIGIN) bad.push("ADMIN_ORIGIN must list your admin site origin(s)");
    for (const o of d.ADMIN_ORIGIN.split(",").map((x) => x.trim()).filter(Boolean)) if (!o.startsWith("https://") || o.includes("*")) bad.push(`ADMIN_ORIGIN entry "${o}" must be an exact https:// origin`);
    if (/change-me|example/i.test(d.JWT_ACCESS_SECRET)) bad.push("JWT_ACCESS_SECRET still looks like a placeholder");
    if (bad.length) throw new Error("Invalid environment:\n" + bad.join("\n"));
  }
  if (d.FCM_SERVICE_ACCOUNT_JSON) {
    try { const j = JSON.parse(d.FCM_SERVICE_ACCOUNT_JSON); if (!j.project_id || !j.client_email || !j.private_key) throw new Error("missing fields"); }
    catch { throw new Error("Invalid environment:\nFCM_SERVICE_ACCOUNT_JSON must be the full service-account JSON (project_id, client_email, private_key)"); }
  }
  if (d.EMAIL_DRIVER === "resend" && !(d.RESEND_API_KEY && d.EMAIL_FROM)) throw new Error("Invalid environment:\nEMAIL_DRIVER=resend requires RESEND_API_KEY and EMAIL_FROM");
  if (d.EMAIL_DRIVER === "brevo" && !(d.BREVO_API_KEY && d.EMAIL_FROM)) throw new Error("Invalid environment:\nEMAIL_DRIVER=brevo requires BREVO_API_KEY and EMAIL_FROM");
  if (d.EMAIL_DRIVER === "smtp" && !(d.SMTP_HOST && d.EMAIL_FROM)) throw new Error("Invalid environment:\nEMAIL_DRIVER=smtp requires SMTP_HOST and EMAIL_FROM");
  if (r.data.STORAGE_DRIVER === "s3" && !(r.data.S3_BUCKET && r.data.S3_ACCESS_KEY_ID && r.data.S3_SECRET_ACCESS_KEY && r.data.PUBLIC_MEDIA_BASE_URL)) {
    throw new Error("Invalid environment:\nSTORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, PUBLIC_MEDIA_BASE_URL");
  }
  return r.data;
}
