DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_payment_status') THEN
    CREATE TYPE invoice_payment_status AS ENUM ('unpaid', 'paid', 'expired');
  END IF;
END $$;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url text,
  ADD COLUMN IF NOT EXISTS payment_status invoice_payment_status DEFAULT 'unpaid';

UPDATE documents
SET payment_status = 'unpaid'
WHERE type = 'invoice' AND payment_status IS NULL;

CREATE INDEX IF NOT EXISTS documents_invoice_payment_status_idx
  ON documents(user_id, type, payment_status);
