-- Customer replies on WhatsApp (YES to confirm, AI answers, STOP), and the new-product message.
ALTER TABLE whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_kind_check;
ALTER TABLE whatsapp_logs ADD CONSTRAINT whatsapp_logs_kind_check CHECK (kind IN ('welcome', 'order_confirmation', 'new_arrival', 'reply'));
-- Meta delivers a webhook at least once: remember message ids so a customer is never answered twice.
CREATE TABLE IF NOT EXISTS whatsapp_inbound (message_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
-- Numbers that replied STOP: they get no promotional (new product) messages until they reply START.
CREATE TABLE IF NOT EXISTS whatsapp_optouts (phone text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
