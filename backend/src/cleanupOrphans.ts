import { loadConfig } from "./config.js";
import { PgCatalog } from "./pgCatalog.js";
import { PgStore } from "./pgStore.js";
import { createStorage } from "./storage.js";

// Deletes stored product images that no DB row references (failed uploads/deletes). Dry-run unless --apply.
const apply = process.argv.includes("--apply");
const cfg = loadConfig(); const store = new PgStore(cfg.DATABASE_URL);
const used = await new PgCatalog(store.db).allImageKeys();
const storage = createStorage(cfg);
const orphans = (await storage.list("products/")).filter((k) => !used.has(k));
console.log(`${orphans.length} orphan file(s)${apply ? ", deleting" : " (dry run, pass --apply)"}`);
if (apply) for (const k of orphans) await storage.delete(k);
await store.close();
