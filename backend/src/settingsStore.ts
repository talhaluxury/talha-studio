import type pg from "pg";
import { DEFAULT_PAGES, type PageSlug } from "./policyDefaults.js";

export interface TemplateText { subject: string; intro: string; footer: string }
export type TemplateKey = "order_confirmation" | "owner_new_order" | "status_update";
export interface StoreSettings {
  ownerEmail: string;
  store: { name: string; supportEmail: string; supportPhone: string; address: string };
  estimatedDelivery: string;          // shown in the customer email only when not empty
  templates: Record<TemplateKey, TemplateText>;
  shipping: { flat: number; freeOver: number };            // freeOver 0 = free shipping disabled
  announcement: { text: string; active: boolean };          // strip shown on the app home screen
  pages: Record<PageSlug, string>;                          // policy / about page bodies
}

export const DEFAULT_SETTINGS: StoreSettings = {
  ownerEmail: "",
  store: { name: "Talha Studio", supportEmail: "", supportPhone: "", address: "" },
  estimatedDelivery: "",
  shipping: { flat: 299, freeOver: 0 },
  announcement: { text: "", active: false },
  pages: DEFAULT_PAGES,
  templates: {
    order_confirmation: { subject: "Your Talha Studio order {{orderNumber}}", intro: "Thank you for your order, {{customerName}}. We have received it and will confirm it shortly.", footer: "Questions about your order? Contact us using the details below." },
    owner_new_order: { subject: "New order {{orderNumber}} - {{total}}", intro: "A new order has just been placed.", footer: "" },
    status_update: { subject: "Your order {{orderNumber}} is {{status}}", intro: "The status of your order has changed to {{status}}.", footer: "Thank you for shopping with us." },
  },
};

export interface SettingsStore { load(): Promise<StoreSettings>; save(s: StoreSettings): Promise<void> }

const KEY = "store";
const merge = (v: Partial<StoreSettings> | null, ship: StoreSettings["shipping"] = DEFAULT_SETTINGS.shipping): StoreSettings => ({
  ...DEFAULT_SETTINGS, ...(v ?? {}),
  shipping: { ...ship, ...(v?.shipping ?? {}) },
  announcement: { ...DEFAULT_SETTINGS.announcement, ...(v?.announcement ?? {}) },
  pages: { ...DEFAULT_SETTINGS.pages, ...(v?.pages ?? {}) },
  store: { ...DEFAULT_SETTINGS.store, ...(v?.store ?? {}) },
  templates: {
    order_confirmation: { ...DEFAULT_SETTINGS.templates.order_confirmation, ...(v?.templates?.order_confirmation ?? {}) },
    owner_new_order: { ...DEFAULT_SETTINGS.templates.owner_new_order, ...(v?.templates?.owner_new_order ?? {}) },
    status_update: { ...DEFAULT_SETTINGS.templates.status_update, ...(v?.templates?.status_update ?? {}) },
  },
});

export class MemorySettings implements SettingsStore {
  private v: StoreSettings | null = null;
  async load() { return merge(this.v); }
  async save(s: StoreSettings) { this.v = structuredClone(s); }
}
/** `shippingDefault` seeds shipping the first time (from the SHIPPING_* env vars); after the owner saves, the stored value wins. */
export class PgSettings implements SettingsStore {
  constructor(private pool: pg.Pool, private shippingDefault?: StoreSettings["shipping"]) {}
  async load() { const r = await this.pool.query("SELECT value FROM store_settings WHERE key = $1", [KEY]); return merge(r.rows[0]?.value ?? null, this.shippingDefault); }
  async save(s: StoreSettings) {
    await this.pool.query("INSERT INTO store_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [KEY, JSON.stringify(s)]);
  }
}
