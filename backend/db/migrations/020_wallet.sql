-- Wallet (welcome bonus + referral). Balance = sum of the ledger. Orders remember how much wallet money they used so a cancel can return it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  amount integer NOT NULL,                       -- + credit, - spend
  kind text NOT NULL CHECK (kind IN ('signup','referral_joined','referral_reward','order','refund','adjust')),
  note text NOT NULL DEFAULT '',
  order_id uuid REFERENCES orders ON DELETE SET NULL,
  ref_id uuid,                                   -- the other person in a referral
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_user_idx ON wallet_transactions (user_id, created_at DESC);
-- a welcome bonus / referral reward can only be given once per person
CREATE UNIQUE INDEX IF NOT EXISTS wallet_once ON wallet_transactions (user_id, kind, COALESCE(ref_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE kind IN ('signup','referral_joined','referral_reward');
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used integer NOT NULL DEFAULT 0;
