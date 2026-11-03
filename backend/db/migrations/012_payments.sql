-- Manual payment methods (JazzCash / Easypaisa / bank transfer): the customer pays first and enters the transaction ID, the owner confirms in the admin app.
ALTER TABLE orders ALTER COLUMN payment_method DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN payment_method TYPE text USING payment_method::text;
ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'cod';
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_chk CHECK (payment_method IN ('cod','jazzcash','easypaisa','bank'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref text;
