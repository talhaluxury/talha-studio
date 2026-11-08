-- One short video per product or per home banner (stored in object storage, referenced here).
CREATE TABLE IF NOT EXISTS media_videos (
  entity text NOT NULL CHECK (entity IN ('product', 'banner')),
  entity_id uuid NOT NULL,
  video_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, entity_id)
);
