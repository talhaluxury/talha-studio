-- One row per WhatsApp message we decided to send. UNIQUE (kind, ref_id) makes sending idempotent: a retry or double event never messages twice.
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('welcome', 'order_confirmation')),
  ref_id text NOT NULL,
  to_phone text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_to_idx ON whatsapp_logs (to_phone, created_at);
