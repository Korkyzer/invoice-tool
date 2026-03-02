ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_micro_entrepreneur boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_legal_mention_no_vat boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS legal_mention_no_vat text DEFAULT 'TVA non applicable, art. 293 B du CGI.';
