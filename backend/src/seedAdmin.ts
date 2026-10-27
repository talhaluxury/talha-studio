import { loadConfig } from "./config.js";
import { PgStore } from "./pgStore.js";
import { hashPassword } from "./security.js";

// Creates the first OWNER from env vars (once). Remove ADMIN_BOOTSTRAP_PASSWORD afterwards.
const cfg = loadConfig();
const email = cfg.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase();
const pw = cfg.ADMIN_BOOTSTRAP_PASSWORD;
if (!email || !pw || pw.length < 12) { console.error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD (>= 12 chars)."); process.exit(1); }
const store = new PgStore(cfg.DATABASE_URL);
if (await store.findUserByEmail(email)) console.log("User already exists; nothing changed.");
else { await store.createUser({ email, passwordHash: await hashPassword(pw), googleSub: null, fullName: "Store Owner", phone: null, role: "owner" }); console.log("Owner created:", email); }
await store.close();
