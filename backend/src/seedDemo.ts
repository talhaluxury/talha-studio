import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { loadConfig } from "./config.js";
import { DuplicateError } from "./catalogStore.js";
import { PgCatalog } from "./pgCatalog.js";
import { PgStore } from "./pgStore.js";
import { createStorage } from "./storage.js";

/**
 * DEMO DATA for development/testing only. Every product is labelled "Demo", SKUs start with DEMO-, and images are
 * neutral generated tiles (not photos). Refuses to run in production unless --force. Safe to re-run (skips existing SKUs).
 * Delete demo products from the admin panel (search "DEMO-") before real launch.
 */
const cfg = loadConfig();
if (cfg.NODE_ENV === "production" && !process.argv.includes("--force")) { console.error("Refusing to seed demo data in production (use --force if you really mean it)."); process.exit(1); }

const store = new PgStore(cfg.DATABASE_URL); const catalog = new PgCatalog(store.db); const storage = createStorage(cfg);
const cats: Record<string, string> = {};
for (const [i, [slug, name]] of [["women", "Women"], ["men", "Men"], ["unstitched", "Unstitched"], ["stitched", "Stitched"], ["accessories", "Accessories"]].entries()) {
  const existing = (await catalog.listCategories(false)).find((c) => c.slug === slug);
  cats[slug!] = (existing ?? await catalog.createCategory({ name: name!, slug: slug!, parentId: null, sortOrder: i, isActive: true })).id;
}

const tile = async (label: string, bg: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><rect width="100%" height="100%" fill="${bg}"/>
    <text x="50%" y="48%" text-anchor="middle" font-family="serif" font-size="220" fill="#B99A62">${label[0]}</text>
    <text x="50%" y="58%" text-anchor="middle" font-family="sans-serif" font-size="46" fill="#77736D">DEMO PRODUCT</text></svg>`;
  const full = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  return { full, thumb: await sharp(full).resize({ width: 400 }).webp({ quality: 72 }).toBuffer() };
};
const sizes = ["S", "M", "L", "XL"];
const demo = [
  ["women", "Embroidered Lawn Suit", 6999, 4999, "Lawn", ["Black", "Olive"], sizes, true],
  ["women", "Chiffon Formal Dress", 8999, 7499, "Chiffon", ["Burgundy"], sizes, true],
  ["women", "Printed Dupatta", 1499, null, "Chiffon", ["Gold", "Ivory"], [], false],
  ["men", "Wash & Wear Suit", 6499, null, "Wash & Wear", ["Navy", "Charcoal"], ["M", "L", "XL"], true],
  ["men", "Linen Shirt", 3499, 2999, "Linen", ["Sand", "White"], ["S", "M", "L"], false],
  ["unstitched", "Cotton Unstitched 3-Piece", 4999, null, "Cotton", ["Plum"], [], false],
  ["stitched", "Ready-to-Wear Kurta", 3999, null, "Cotton", ["Black"], sizes, false],
  ["accessories", "Embroidered Clutch", 2499, 1999, "Velvet", ["Black", "Gold"], [], false],
] as const;

let created = 0;
for (const [i, [cat, name, price, sale, fabric, colors, szs, featured]] of demo.entries()) {
  const sku = `DEMO-${String(i + 1).padStart(3, "0")}`;
  const variants = (szs.length ? szs : [null]).flatMap((s) => colors.map((c) => ({ sku: `${sku}-${s ?? "OS"}-${c.slice(0, 3).toUpperCase()}`, size: s, color: c, stock: 3 + ((i * 7 + (s?.length ?? 1)) % 12) })));
  try {
    const p = await catalog.createProduct({ sku, name: `${name} (Demo)`, description: "Demo product for testing. Not real inventory.", categoryId: cats[cat]!, price, salePrice: sale, fabric, isPublished: false, isFeatured: featured, variants });
    const t = await tile(name, ["#E9E0D3", "#EFE8DC", "#E4DACB"][i % 3]!);
    const base = `products/${p.id}/${randomUUID()}`;
    await storage.put(`${base}.webp`, t.full, "image/webp"); await storage.put(`${base}-thumb.webp`, t.thumb, "image/webp");
    await catalog.addImage(p.id, { storageKey: `${base}.webp`, thumbKey: `${base}-thumb.webp`, width: 1200, height: 1500 });
    await catalog.setPublished(p.id, true); created++;
  } catch (e) { if (!(e instanceof DuplicateError)) throw e; }
}
console.log(`Demo seed done: ${created} new product(s), ${demo.length - created} already present.`);
await store.close();
