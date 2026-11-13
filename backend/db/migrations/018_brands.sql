-- Seller brands (marketplace). A customer account applies for a brand; the admin approves the account, the seller builds a brand
-- page (a draft), and the admin approves the page before it goes live. Products of a brand stay in the normal `products` table
-- (so cart, checkout, stock and orders work unchanged); brand_products only says who owns a product and whether it was reviewed.
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE,       -- one brand per seller account
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','suspended')),   -- the seller ACCOUNT
  status_note text,
  page_status text NOT NULL DEFAULT 'draft' CHECK (page_status IN ('draft','submitted','approved','rejected')),   -- the brand PAGE
  page_note text,
  contact_phone text NOT NULL,
  city text NOT NULL DEFAULT '',
  business_note text NOT NULL DEFAULT '',
  draft jsonb NOT NULL,                      -- what the seller is editing
  live jsonb,                                -- the last page the admin approved; customers only ever see this
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  live_at timestamptz
);
CREATE INDEX IF NOT EXISTS brands_status_idx ON brands (status, page_status);

CREATE TABLE IF NOT EXISTS brand_products (
  product_id uuid PRIMARY KEY REFERENCES products ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES brands ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','pending','approved','rejected','archived')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_products_brand_idx ON brand_products (brand_id, state);
