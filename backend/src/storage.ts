import { mkdir, readdir, rm, writeFile, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Config } from "./config.js";

/** Provider-agnostic object storage. Swap drivers via STORAGE_DRIVER without touching routes. */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  url(key: string): string;
}

const safeKey = (k: string) => {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(k) || k.includes("..")) throw new Error("unsafe storage key");
  return k;
};

export class LocalStorage implements Storage {
  constructor(public dir: string, private base: string) {}
  resolvePath(key: string) {
    const root = resolve(this.dir);
    const full = resolve(root, normalize(safeKey(key)));
    if (full !== root && !full.startsWith(root + sep)) throw new Error("path escape");
    return full;
  }
  async put(key: string, body: Buffer) { const f = this.resolvePath(key); await mkdir(dirname(f), { recursive: true }); await writeFile(f, body); }
  async delete(key: string) { await rm(this.resolvePath(key), { force: true }); }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = async (rel: string) => {
      let entries; try { entries = await readdir(join(resolve(this.dir), rel), { withFileTypes: true }); } catch { return; }
      for (const e of entries) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) await walk(r); else if (r.startsWith(prefix)) out.push(r); }
    };
    await walk(""); return out;
  }
  url(key: string) { return `${this.base.replace(/\/$/, "")}/${key}`; }
  async exists(key: string) { try { await stat(this.resolvePath(key)); return true; } catch { return false; } }
}

export class S3Storage implements Storage {
  private c: S3Client;
  constructor(private cfg: Pick<Config, "S3_ENDPOINT" | "S3_REGION" | "S3_BUCKET" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY" | "PUBLIC_MEDIA_BASE_URL">) {
    this.c = new S3Client({
      region: cfg.S3_REGION, endpoint: cfg.S3_ENDPOINT || undefined, forcePathStyle: !!cfg.S3_ENDPOINT,
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.c.send(new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: safeKey(key), Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
  }
  async delete(key: string) { await this.c.send(new DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: safeKey(key) })); }
  async list(prefix: string) {
    const out: string[] = []; let token: string | undefined;
    do {
      const r = await this.c.send(new ListObjectsV2Command({ Bucket: this.cfg.S3_BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) out.push(o.Key);
      token = r.NextContinuationToken;
    } while (token);
    return out;
  }
  url(key: string) { return `${this.cfg.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`; }
}

export function createStorage(cfg: Config): Storage {
  return cfg.STORAGE_DRIVER === "s3" ? new S3Storage(cfg) : new LocalStorage(cfg.LOCAL_MEDIA_DIR, cfg.PUBLIC_MEDIA_BASE_URL);
}

/** Test double. */
export class MemoryStorage implements Storage {
  files = new Map<string, Buffer>();
  async put(k: string, b: Buffer) { this.files.set(safeKey(k), b); }
  async delete(k: string) { this.files.delete(k); }
  async list(prefix: string) { return [...this.files.keys()].filter((k) => k.startsWith(prefix)); }
  url(k: string) { return `https://media.test/${k}`; }
}
