-- Notifications can carry a picture (big-picture style push + picture in the in-app inbox).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE notification_campaigns ADD COLUMN IF NOT EXISTS image_url text;
