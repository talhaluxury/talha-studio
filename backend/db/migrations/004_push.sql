-- Phase 7: push + in-app inbox.
ALTER TABLE notification_campaigns ADD COLUMN IF NOT EXISTS failed int NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS campaigns_created_idx ON notification_campaigns (created_at DESC);
