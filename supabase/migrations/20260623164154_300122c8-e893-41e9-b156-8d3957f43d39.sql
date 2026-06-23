
CREATE TABLE public.attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria text NOT NULL CHECK (imobiliaria IN ('cordial','morar','ambas')),
  cliente_id uuid,
  cliente_nome text NOT NULL,
  telefone text NOT NULL,
  email text,
  contato_preferencial text NOT NULL DEFAULT 'whatsapp',
  origem text NOT NULL DEFAULT 'whatsapp',
  finalidade text NOT NULL DEFAULT 'compra',
  tipo_imovel text NOT NULL DEFAULT 'apartamento',
  dormitorios text,
  bairro_interesse text,
  orcamento_min numeric,
  orcamento_max numeric,
  imovel_id uuid,
  imovel_descricao text,
  corretor_id text,
  corretor_nome text,
  prioridade text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'novo',
  proximo_retorno timestamptz,
  proximo_passo text,
  observacoes text,
  historico_inicial text,
  motivo_perda text,
  convertido_em_cliente boolean NOT NULL DEFAULT false,
  cliente_convertido_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO authenticated;
GRANT ALL ON public.attendances TO service_role;

ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own attendances or admin"
  ON public.attendances FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users insert own attendances"
  ON public.attendances FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update own attendances or admin"
  ON public.attendances FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users delete own attendances or admin"
  ON public.attendances FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER attendances_touch_updated_at
  BEFORE UPDATE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX attendances_created_by_idx ON public.attendances(created_by);
CREATE INDEX attendances_created_at_idx ON public.attendances(created_at DESC);
