-- One lucky-wheel spin per customer per day; the prize (if any) is a single-use coupon.
CREATE TABLE IF NOT EXISTS spin_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  percent int NOT NULL,
  coupon_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spin_log_user_idx ON spin_log (user_id, created_at DESC);
