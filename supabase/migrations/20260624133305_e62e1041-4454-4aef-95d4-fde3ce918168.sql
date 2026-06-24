CREATE TABLE public.agenciamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria text NOT NULL CHECK (imobiliaria IN ('cordial','morar','ambas')),
  tipo_imovel text NOT NULL,
  endereco text NOT NULL,
  bairro text,
  cidade text,
  descricao_imovel text,
  proprietario_nome text NOT NULL,
  proprietario_telefone text NOT NULL,
  proprietario_contato_preferencial text,
  proprietario_observacoes text,
  corretor_id text NOT NULL,
  corretor_nome text NOT NULL,
  data_agenciamento date NOT NULL,
  origem text NOT NULL DEFAULT 'indicacao',
  status text NOT NULL DEFAULT 'novo',
  fotos_realizadas boolean NOT NULL DEFAULT false,
  fotos_drive boolean NOT NULL DEFAULT false,
  placa_instalada boolean NOT NULL DEFAULT false,
  cadastrado_site boolean NOT NULL DEFAULT false,
  video_realizado boolean NOT NULL DEFAULT false,
  validado boolean NOT NULL DEFAULT false,
  drive_folder_url text,
  site_url text,
  observacoes_internas text,
  criado_por_nome text,
  validado_por_id uuid,
  validado_por_nome text,
  validado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenciamentos TO authenticated;
GRANT ALL ON public.agenciamentos TO service_role;

ALTER TABLE public.agenciamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenciamentos_select_own_or_admin"
  ON public.agenciamentos FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "agenciamentos_insert_own"
  ON public.agenciamentos FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "agenciamentos_update_own_or_admin"
  ON public.agenciamentos FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "agenciamentos_delete_admin"
  ON public.agenciamentos FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.agenciamentos_enforce_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT v_is_admin THEN
    NEW.validado := false;
    NEW.validado_por_id := NULL;
    NEW.validado_por_nome := NULL;
    NEW.validado_em := NULL;
    IF NEW.status = 'validado' THEN
      NEW.status := 'aguardando_validacao';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agenciamentos_enforce_validation_trg
  BEFORE INSERT OR UPDATE ON public.agenciamentos
  FOR EACH ROW EXECUTE FUNCTION public.agenciamentos_enforce_validation();

CREATE TRIGGER agenciamentos_touch_updated_at
  BEFORE UPDATE ON public.agenciamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX agenciamentos_created_by_idx ON public.agenciamentos(created_by);
CREATE INDEX agenciamentos_created_at_idx ON public.agenciamentos(created_at DESC);
CREATE INDEX agenciamentos_status_idx ON public.agenciamentos(status);
CREATE INDEX agenciamentos_imobiliaria_idx ON public.agenciamentos(imobiliaria);
CREATE INDEX agenciamentos_corretor_id_idx ON public.agenciamentos(corretor_id);