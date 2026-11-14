-- Parcel tracking details, product reviews (verified buyers only) and "tell me when it is back" alerts.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no text;
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '',
  author text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS reviews_product ON reviews (product_id, created_at DESC);
CREATE TABLE IF NOT EXISTS stock_alerts (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
