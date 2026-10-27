-- Talha Studio schema (PostgreSQL 14+). Money = integer PKR. All ids are UUIDs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('customer','staff','admin','owner');
CREATE TYPE order_status AS ENUM ('pending','confirmed','processing','shipped','delivered','cancelled','refund_requested','refunded');
CREATE TYPE payment_method AS ENUM ('cod');          -- extend when a gateway is added
CREATE TYPE payment_status AS ENUM ('unpaid','paid','refunded');
CREATE TYPE email_status AS ENUM ('queued','sent','failed');
CREATE TYPE discount_type AS ENUM ('percent','fixed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text,                       -- argon2id; NULL for Google-only accounts
  google_sub text UNIQUE,
  full_name text NOT NULL,
  phone text,
  role user_role NOT NULL DEFAULT 'customer',
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,                   -- account deletion (anonymised, orders retained)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  label text, recipient text NOT NULL, phone text NOT NULL,
  line1 text NOT NULL, line2 text, city text NOT NULL, province text, postal_code text,
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, name text NOT NULL, parent_id uuid REFERENCES categories,
  image_key text, sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL, slug text UNIQUE NOT NULL,
  name text NOT NULL, description text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES categories,
  price int NOT NULL CHECK (price >= 0),
  sale_price int CHECK (sale_price IS NULL OR (sale_price >= 0 AND sale_price < price)),
  fabric text, is_published boolean NOT NULL DEFAULT false, is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_variants (           -- inventory lives per size/color
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  sku text UNIQUE NOT NULL, size text, color text,
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size, color)
);
CREATE TABLE product_images (             -- files live in object storage; DB keeps only keys
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  storage_key text NOT NULL, thumb_key text NOT NULL,
  width int, height int, sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, subtitle text, cta_label text, cta_link text,
  image_key text, sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz, ends_at timestamptz
);
CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, title text NOT NULL, kind text NOT NULL DEFAULT 'custom', -- new_arrivals|best_sellers|sale|custom
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE collection_products (
  collection_id uuid REFERENCES collections ON DELETE CASCADE,
  product_id uuid REFERENCES products ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0, PRIMARY KEY (collection_id, product_id)
);
CREATE TABLE wishlist_items (
  user_id uuid REFERENCES users ON DELETE CASCADE,
  product_id uuid REFERENCES products ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, product_id)
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code citext UNIQUE NOT NULL, type discount_type NOT NULL, value int NOT NULL CHECK (value > 0),
  min_subtotal int NOT NULL DEFAULT 0, max_uses int, used_count int NOT NULL DEFAULT 0,
  starts_at timestamptz, ends_at timestamptz, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE store_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
-- keys: owner_email, shipping {flat, free_over}, store_contact, estimated_delivery, email_templates

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,                 -- e.g. TS-100245
  user_id uuid REFERENCES users ON DELETE SET NULL,
  idempotency_key text UNIQUE,                       -- stops duplicate orders on client retry
  status order_status NOT NULL DEFAULT 'pending',
  payment_method payment_method NOT NULL DEFAULT 'cod',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  subtotal int NOT NULL, discount int NOT NULL DEFAULT 0, shipping int NOT NULL, total int NOT NULL,
  coupon_code text,
  customer_name text NOT NULL, customer_email citext NOT NULL, customer_phone text NOT NULL,
  ship_line1 text NOT NULL, ship_line2 text, ship_city text NOT NULL, ship_province text, ship_postal text,
  notes text, tracking_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE order_number_seq START 100001;
CREATE TABLE order_items (                           -- snapshot of name/price at purchase time
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders ON DELETE CASCADE,
  product_id uuid REFERENCES products ON DELETE SET NULL,
  variant_id uuid REFERENCES product_variants ON DELETE SET NULL,
  name text NOT NULL, sku text NOT NULL, size text, color text,
  unit_price int NOT NULL, qty int NOT NULL CHECK (qty > 0)
);
CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders ON DELETE CASCADE,
  status order_status NOT NULL, note text, changed_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders, reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested', admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox for email: order is committed first, email is sent by a worker with retries.
CREATE TABLE email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders ON DELETE SET NULL,
  kind text NOT NULL,                                -- order_confirmation | owner_new_order | status_update
  to_email text NOT NULL,
  dedupe_key text UNIQUE NOT NULL,                   -- e.g. order_confirmation:<order_id> => never sent twice
  status email_status NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users ON DELETE CASCADE,
  fcm_token text UNIQUE NOT NULL, platform text NOT NULL DEFAULT 'android',
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  order_updates boolean NOT NULL DEFAULT true, promotions boolean NOT NULL DEFAULT true
);
CREATE TABLE notifications (                          -- in-app inbox
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users ON DELETE CASCADE,
  title text NOT NULL, body text NOT NULL, deep_link text, kind text NOT NULL,
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL, deep_link text,
  created_by uuid REFERENCES users, sent_at timestamptz, recipients int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES users, action text NOT NULL, entity text, entity_id text,
  meta jsonb, ip inet, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON products (category_id) WHERE is_published;
CREATE INDEX ON products USING gin (to_tsvector('simple', name || ' ' || description));
CREATE INDEX ON product_images (product_id, sort_order);
CREATE INDEX ON orders (user_id, created_at DESC);
CREATE INDEX ON orders (status, created_at DESC);
CREATE INDEX ON order_items (order_id);
CREATE INDEX ON email_logs (status, next_attempt_at);
CREATE INDEX ON notifications (user_id, created_at DESC);
