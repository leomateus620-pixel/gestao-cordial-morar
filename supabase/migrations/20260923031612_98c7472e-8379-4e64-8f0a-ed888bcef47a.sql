CREATE TABLE IF NOT EXISTS public.backup_20260923_address_fix (
  property_id uuid PRIMARY KEY, numero_original text, complemento_original text,
  numero_novo text, complemento_novo text, saved_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.backup_20260923_address_fix FROM anon, authenticated;
GRANT ALL ON public.backup_20260923_address_fix TO service_role;
ALTER TABLE public.backup_20260923_address_fix ENABLE ROW LEVEL SECURITY;