-- Phase 8: coupons usage guard, banner link validation helpers.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE coupons ADD CONSTRAINT coupons_percent_range CHECK (type <> 'percent' OR value BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS orders_coupon_idx ON orders (coupon_code) WHERE coupon_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_created_idx ON admin_activity_logs (created_at DESC);
