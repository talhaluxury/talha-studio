-- Phase 6: email outbox details. `status` = our queue state; `provider_state` = what the provider later CONFIRMED.
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider_state text;      -- accepted | delivered | delayed | bounced | complained
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS email_logs_msgid_idx ON email_logs (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_created_idx ON email_logs (created_at DESC);
