DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_status') THEN
    CREATE TYPE expense_status AS ENUM ('pending_review', 'matched', 'exported');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  montant_ttc numeric NOT NULL DEFAULT 0,
  montant_ht numeric,
  tva numeric,
  devise text NOT NULL DEFAULT 'EUR',
  date date NOT NULL DEFAULT CURRENT_DATE,
  marchand text NOT NULL,
  categorie text NOT NULL CHECK (categorie IN ('restaurant', 'transport', 'hebergement', 'materiel', 'logiciel', 'autre')),
  description text,
  numero_facture text,
  receipt_url text,
  qonto_transaction_id text,
  status expense_status NOT NULL DEFAULT 'pending_review',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'expenses_set_updated_at'
  ) THEN
    CREATE TRIGGER expenses_set_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'own expenses'
  ) THEN
    CREATE POLICY "own expenses" ON expenses
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expenses_user_created_idx ON expenses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_user_status_idx ON expenses(user_id, status);

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'receipts read own'
  ) THEN
    CREATE POLICY "receipts read own"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'receipts' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'receipts insert own'
  ) THEN
    CREATE POLICY "receipts insert own"
      ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'receipts' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'receipts update own'
  ) THEN
    CREATE POLICY "receipts update own"
      ON storage.objects
      FOR UPDATE
      USING (bucket_id = 'receipts' AND auth.uid() = owner)
      WITH CHECK (bucket_id = 'receipts' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'receipts delete own'
  ) THEN
    CREATE POLICY "receipts delete own"
      ON storage.objects
      FOR DELETE
      USING (bucket_id = 'receipts' AND auth.uid() = owner);
  END IF;
END $$;
