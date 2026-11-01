-- Products the owner marks as New Arrival show first in the app's New Arrivals row (when none is marked, the newest products are shown as before).
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;
