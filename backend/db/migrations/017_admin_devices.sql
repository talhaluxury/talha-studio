-- Phones running the admin app, so a new order can be pushed to the owner and staff.
CREATE TABLE IF NOT EXISTS admin_device_tokens (
  fcm_token text PRIMARY KEY,
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_device_tokens_admin_idx ON admin_device_tokens (admin_id);
