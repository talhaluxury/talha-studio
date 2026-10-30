-- Onboarding slide images (managed in the admin panel), customer<->store chat, and 24-hour "status" pictures.
CREATE TABLE IF NOT EXISTS onboarding_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  image_key text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  seq bigserial PRIMARY KEY,                       -- monotonic cursor used for polling ("give me everything after seq N")
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  customer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer', 'store')),
  body text NOT NULL DEFAULT '',
  image_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT chat_not_empty CHECK (body <> '' OR image_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS chat_customer_idx ON chat_messages (customer_id, seq);
CREATE INDEX IF NOT EXISTS chat_unread_idx ON chat_messages (sender, customer_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS status_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_key text NOT NULL,
  caption text,
  created_by uuid REFERENCES users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS status_expires_idx ON status_posts (expires_at);

CREATE TABLE IF NOT EXISTS status_views (
  status_id uuid NOT NULL REFERENCES status_posts ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (status_id, user_id)
);
