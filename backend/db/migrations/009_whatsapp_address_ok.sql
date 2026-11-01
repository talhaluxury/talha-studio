-- Order confirmation on WhatsApp: the customer confirms the address (address_ok), or corrects it (address_fix) and then confirms.
ALTER TABLE whatsapp_logs DROP CONSTRAINT IF EXISTS whatsapp_logs_kind_check;
ALTER TABLE whatsapp_logs ADD CONSTRAINT whatsapp_logs_kind_check CHECK (kind IN ('welcome', 'order_confirmation', 'new_arrival', 'reply', 'address_ok', 'address_fix'));
