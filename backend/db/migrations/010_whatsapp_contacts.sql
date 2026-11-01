-- Numbers the owner adds by hand (people who are not app customers) so they get product messages too.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Final list of message kinds (this also repairs 009 if it ran before address_fix existed).
ALTER TABLE whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_kind_check;
ALTER TABLE whatsapp_logs ADD CONSTRAINT whatsapp_logs_kind_check CHECK (kind IN ('welcome', 'order_confirmation', 'new_arrival', 'reply', 'address_ok', 'address_fix', 'custom'));
