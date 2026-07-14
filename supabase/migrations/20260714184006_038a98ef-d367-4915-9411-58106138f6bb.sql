CREATE TABLE public.financeiro_sheet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id text NOT NULL,
  sheet_name text NOT NULL DEFAULT 'Sheet1',
  range text NOT NULL DEFAULT 'A2:H1000',
  header_row int NOT NULL DEFAULT 1,
  last_import_at timestamptz,
  last_import_count int,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_sheet_config TO authenticated;
GRANT ALL ON public.financeiro_sheet_config TO service_role;

ALTER TABLE public.financeiro_sheet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sheet config"
  ON public.financeiro_sheet_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert sheet config"
  ON public.financeiro_sheet_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update sheet config"
  ON public.financeiro_sheet_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete sheet config"
  ON public.financeiro_sheet_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER financeiro_sheet_config_touch_updated_at
  BEFORE UPDATE ON public.financeiro_sheet_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS financeiro_lancamentos_origem_id_unique
  ON public.financeiro_lancamentos (origem, origem_id)
  WHERE origem IS NOT NULL AND origem_id IS NOT NULL;
