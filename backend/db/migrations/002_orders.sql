-- Phase 5: order snapshots keep the product thumbnail; helpful indexes for admin lists/analytics.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS thumb_key text;
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (customer_email);
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON return_requests (order_id);
