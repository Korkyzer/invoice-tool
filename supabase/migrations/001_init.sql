-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- profiles (extends auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  company_name text,
  siret text,
  tva_number text,
  address text,
  iban text,
  email text,
  logo_url text,
  default_payment_terms text DEFAULT 'Paiement à réception de facture',
  default_vat_rate numeric DEFAULT 20,
  is_micro_entrepreneur boolean DEFAULT false,
  auto_legal_mention_no_vat boolean DEFAULT true,
  legal_mention_no_vat text DEFAULT 'TVA non applicable, art. 293 B du CGI.',
  invoice_prefix text DEFAULT 'FAC',
  quote_prefix text DEFAULT 'DEV',
  invoice_next_number integer DEFAULT 1,
  quote_next_number integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  siret text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('invoice', 'quote')),
  number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_snapshot jsonb,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  payment_date date,
  subtotal_ht numeric DEFAULT 0,
  total_tva numeric DEFAULT 0,
  total_ttc numeric DEFAULT 0,
  notes text,
  payment_terms text,
  discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric DEFAULT 0,
  converted_from_id uuid REFERENCES documents(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 20,
  line_total_ht numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  position integer NOT NULL DEFAULT 0
);

-- Per-year, per-type counters (atomic generation)
CREATE TABLE document_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('invoice', 'quote')),
  year integer NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, type, year)
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Atomic number generator used by /api/documents/number
CREATE OR REPLACE FUNCTION next_document_number(
  p_user_id uuid,
  p_type text,
  p_year integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix text;
  v_seed integer;
  v_number integer;
BEGIN
  IF p_type NOT IN ('invoice', 'quote') THEN
    RAISE EXCEPTION 'invalid document type';
  END IF;

  SELECT
    CASE WHEN p_type = 'invoice' THEN COALESCE(invoice_prefix, 'FAC') ELSE COALESCE(quote_prefix, 'DEV') END,
    CASE WHEN p_type = 'invoice' THEN COALESCE(invoice_next_number, 1) ELSE COALESCE(quote_next_number, 1) END
  INTO v_prefix, v_seed
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_prefix IS NULL THEN
    v_prefix := CASE WHEN p_type = 'invoice' THEN 'FAC' ELSE 'DEV' END;
    v_seed := 1;
  END IF;

  INSERT INTO document_counters(user_id, type, year, next_number)
  VALUES (p_user_id, p_type, p_year, v_seed + 1)
  ON CONFLICT (user_id, type, year)
  DO UPDATE SET next_number = document_counters.next_number + 1
  RETURNING next_number - 1 INTO v_number;

  RETURN v_prefix || '-' || p_year::text || '-' || LPAD(v_number::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_document_number(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION next_document_number(uuid, text, integer) TO service_role;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "own profile" ON profiles
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own clients" ON clients
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own documents" ON documents
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own document lines" ON document_lines
  FOR ALL
  USING (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()))
  WITH CHECK (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));

CREATE POLICY "own counters" ON document_counters
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Helpful indexes
CREATE INDEX documents_user_type_created_idx ON documents(user_id, type, created_at DESC);
CREATE INDEX documents_user_status_idx ON documents(user_id, status);
CREATE INDEX document_lines_document_position_idx ON document_lines(document_id, position);
CREATE INDEX clients_user_created_idx ON clients(user_id, created_at DESC);
