-- Owner-made home sections (a title + hand-picked products), and the place where each home banner is shown.
CREATE TABLE IF NOT EXISTS home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS home_section_products (
  section_id uuid NOT NULL REFERENCES home_sections ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (section_id, product_id)
);
-- 'top' = the carousel at the top of the home screen; otherwise the slug of the section the banner is shown under.
ALTER TABLE banners ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'top';
