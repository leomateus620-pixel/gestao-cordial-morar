-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.imobi_provider AS ENUM ('cordial','morar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_finalidade AS ENUM ('venda','locacao','temporada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_publication_status AS ENUM
    ('draft','pending','syncing','published','partial','error','out_of_sync','unpublished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_sync_action AS ENUM ('publish','update','unpublish','delete','reconcile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.property_sync_job_status AS ENUM
    ('pending','processing','retry','succeeded','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PROPERTIES: colunas canônicas adicionais ============
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS finalidade public.property_finalidade,
  ADD COLUMN IF NOT EXISTS corretor_id uuid,
  ADD COLUMN IF NOT EXISTS corretor_nome text,
  ADD COLUMN IF NOT EXISTS proprietario_nome text,
  ADD COLUMN IF NOT EXISTS proprietario_telefone text,
  ADD COLUMN IF NOT EXISTS proprietario_email text,
  ADD COLUMN IF NOT EXISTS origem_captacao text,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  -- endereço
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS zona text,
  ADD COLUMN IF NOT EXISTS regiao text,
  ADD COLUMN IF NOT EXISTS ponto_referencia text,
  ADD COLUMN IF NOT EXISTS nome_condominio text,
  ADD COLUMN IF NOT EXISTS em_condominio boolean,
  ADD COLUMN IF NOT EXISTS mapa text,
  ADD COLUMN IF NOT EXISTS exibir_endereco_site text,
  ADD COLUMN IF NOT EXISTS exibir_endereco_site_personalizado text[],
  ADD COLUMN IF NOT EXISTS exibir_endereco_portal_personalizado text[],
  -- áreas
  ADD COLUMN IF NOT EXISTS area_privativa numeric,
  ADD COLUMN IF NOT EXISTS area_privativa_unidade text,
  ADD COLUMN IF NOT EXISTS area_total_unidade text,
  ADD COLUMN IF NOT EXISTS area_terreno_unidade text,
  ADD COLUMN IF NOT EXISTS area_construida_unidade text,
  ADD COLUMN IF NOT EXISTS terreno_frente numeric,
  ADD COLUMN IF NOT EXISTS terreno_frente_unidade text,
  ADD COLUMN IF NOT EXISTS terreno_fundo numeric,
  ADD COLUMN IF NOT EXISTS terreno_fundo_unidade text,
  ADD COLUMN IF NOT EXISTS terreno_esquerda numeric,
  ADD COLUMN IF NOT EXISTS terreno_esquerda_unidade text,
  ADD COLUMN IF NOT EXISTS terreno_direita numeric,
  ADD COLUMN IF NOT EXISTS terreno_direita_unidade text,
  -- composição
  ADD COLUMN IF NOT EXISTS salas integer,
  ADD COLUMN IF NOT EXISTS acomodacoes integer,
  ADD COLUMN IF NOT EXISTS pavimento text,
  ADD COLUMN IF NOT EXISTS numero_andar text,
  ADD COLUMN IF NOT EXISTS mobiliado text,
  ADD COLUMN IF NOT EXISTS ano_construcao text,
  -- comercial
  ADD COLUMN IF NOT EXISTS valor_iptu numeric,
  ADD COLUMN IF NOT EXISTS valor_condominio numeric,
  ADD COLUMN IF NOT EXISTS valor_taxas numeric,
  ADD COLUMN IF NOT EXISTS valor_observacao text,
  ADD COLUMN IF NOT EXISTS aceita_financiamento boolean,
  ADD COLUMN IF NOT EXISTS permuta boolean,
  -- conteúdo
  ADD COLUMN IF NOT EXISTS descricao_imovel text,
  ADD COLUMN IF NOT EXISTS observacao_imovel text,
  ADD COLUMN IF NOT EXISTS pontos_fortes text,
  ADD COLUMN IF NOT EXISTS outras_informacoes text,
  ADD COLUMN IF NOT EXISTS video text,
  ADD COLUMN IF NOT EXISTS tour_virtual text,
  ADD COLUMN IF NOT EXISTS tarja_imagem text,
  ADD COLUMN IF NOT EXISTS seo_url text,
  ADD COLUMN IF NOT EXISTS seo_titulo text,
  ADD COLUMN IF NOT EXISTS seo_descricao text,
  -- documentação / divulgação
  ADD COLUMN IF NOT EXISTS exclusividade boolean,
  ADD COLUMN IF NOT EXISTS autorizacao boolean,
  ADD COLUMN IF NOT EXISTS averbada boolean,
  ADD COLUMN IF NOT EXISTS escriturada boolean,
  ADD COLUMN IF NOT EXISTS com_placa boolean,
  ADD COLUMN IF NOT EXISTS disponibilidade text,
  ADD COLUMN IF NOT EXISTS local_chave text,
  ADD COLUMN IF NOT EXISTS exibir_imovel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exibir_corretor boolean,
  ADD COLUMN IF NOT EXISTS destaque_inicial boolean,
  ADD COLUMN IF NOT EXISTS super_destaque_inicial boolean,
  ADD COLUMN IF NOT EXISTS disponibilizar_exportacao boolean,
  ADD COLUMN IF NOT EXISTS portais_convencional boolean,
  ADD COLUMN IF NOT EXISTS portais_destaque boolean,
  ADD COLUMN IF NOT EXISTS portais_super_destaque boolean,
  ADD COLUMN IF NOT EXISTS portais_super_destaque2 boolean,
  ADD COLUMN IF NOT EXISTS disparar_periodico boolean,
  -- empreendimento
  ADD COLUMN IF NOT EXISTS tratar_empreendimento boolean,
  ADD COLUMN IF NOT EXISTS nome_empreendimento text,
  ADD COLUMN IF NOT EXISTS descricao_empreendimento text,
  ADD COLUMN IF NOT EXISTS estagio_empreendimento text,
  ADD COLUMN IF NOT EXISTS inicio_previsao_empreendimento text,
  ADD COLUMN IF NOT EXISTS entrega_previsao_empreendimento text,
  ADD COLUMN IF NOT EXISTS numero_torre text,
  ADD COLUMN IF NOT EXISTS torre_unica boolean,
  ADD COLUMN IF NOT EXISTS unidade text,
  -- características locais (labels; mapeadas por provedor)
  ADD COLUMN IF NOT EXISTS caracteristicas text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS properties_referencia_idx ON public.properties (referencia);
CREATE INDEX IF NOT EXISTS properties_finalidade_idx ON public.properties (finalidade);
CREATE INDEX IF NOT EXISTS properties_is_draft_idx ON public.properties (is_draft);

-- backfill de finalidade a partir da operação existente
UPDATE public.properties
   SET finalidade = CASE WHEN operacao = 'aluguel' THEN 'locacao'::public.property_finalidade
                         ELSE 'venda'::public.property_finalidade END
 WHERE finalidade IS NULL;

-- ============ IMAGENS ============
CREATE TABLE IF NOT EXISTS public.property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  content_hash text,
  is_cover boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_images_property_idx ON public.property_images (property_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_images TO authenticated;
GRANT ALL ON public.property_images TO service_role;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property_images_select" ON public.property_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "property_images_insert" ON public.property_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "property_images_update" ON public.property_images FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "property_images_delete" ON public.property_images FOR DELETE TO authenticated USING (true);
CREATE TRIGGER property_images_touch BEFORE UPDATE ON public.property_images
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PUBLICAÇÕES POR PROVEDOR ============
CREATE TABLE IF NOT EXISTS public.property_provider_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  external_property_id text,
  external_reference text NOT NULL,
  external_public_url text,
  status public.property_publication_status NOT NULL DEFAULT 'draft',
  last_payload_hash text,
  last_synced_revision integer,
  last_synced_at timestamptz,
  last_verified_at timestamptz,
  last_error_category text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, provider),
  UNIQUE (provider, external_reference)
);
CREATE UNIQUE INDEX IF NOT EXISTS ppp_provider_external_id_idx
  ON public.property_provider_publications (provider, external_property_id)
  WHERE external_property_id IS NOT NULL;
GRANT SELECT ON public.property_provider_publications TO authenticated;
GRANT ALL ON public.property_provider_publications TO service_role;
ALTER TABLE public.property_provider_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppp_select" ON public.property_provider_publications FOR SELECT TO authenticated USING (true);
CREATE TRIGGER ppp_touch BEFORE UPDATE ON public.property_provider_publications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CATÁLOGOS POR PROVEDOR ============
CREATE TABLE IF NOT EXISTS public.provider_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.imobi_provider NOT NULL,
  kind text NOT NULL CHECK (kind IN ('city','property_type','characteristic')),
  external_code text NOT NULL,
  label text NOT NULL,
  normalized_label text NOT NULL,
  group_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, kind, external_code)
);
CREATE INDEX IF NOT EXISTS pci_lookup_idx ON public.provider_catalog_items (provider, kind, normalized_label);
GRANT SELECT ON public.provider_catalog_items TO authenticated;
GRANT ALL ON public.provider_catalog_items TO service_role;
ALTER TABLE public.provider_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pci_select" ON public.provider_catalog_items FOR SELECT TO authenticated USING (true);

-- mapa genérico local -> código externo, por provedor e domínio
CREATE TABLE IF NOT EXISTS public.provider_value_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.imobi_provider NOT NULL,
  domain text NOT NULL CHECK (domain IN ('property_type','city','characteristic','area_unit','broker','owner')),
  local_key text NOT NULL,
  external_code text NOT NULL,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, domain, local_key)
);
GRANT SELECT ON public.provider_value_maps TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.provider_value_maps TO authenticated;
GRANT ALL ON public.provider_value_maps TO service_role;
ALTER TABLE public.provider_value_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pvm_select" ON public.provider_value_maps FOR SELECT TO authenticated USING (true);
CREATE POLICY "pvm_admin_write" ON public.provider_value_maps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER pvm_touch BEFORE UPDATE ON public.provider_value_maps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ IMAGENS PUBLICADAS ============
CREATE TABLE IF NOT EXISTS public.property_image_provider_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.property_images(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES public.property_provider_publications(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  external_image_id text,
  content_hash text,
  remote_url text,
  is_cover boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  last_error_message text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (image_id, publication_id)
);
GRANT SELECT ON public.property_image_provider_publications TO authenticated;
GRANT ALL ON public.property_image_provider_publications TO service_role;
ALTER TABLE public.property_image_provider_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipp_select" ON public.property_image_provider_publications FOR SELECT TO authenticated USING (true);
CREATE TRIGGER pipp_touch BEFORE UPDATE ON public.property_image_provider_publications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ FILA ============
CREATE TABLE IF NOT EXISTS public.property_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  action public.property_sync_action NOT NULL,
  requested_revision integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status public.property_sync_job_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_expires_at timestamptz,
  locked_by text,
  last_http_status integer,
  last_error_category text,
  last_error_message text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (property_id, provider, action, requested_revision)
);
CREATE INDEX IF NOT EXISTS psj_runnable_idx ON public.property_sync_jobs (status, next_run_at);
GRANT SELECT ON public.property_sync_jobs TO authenticated;
GRANT ALL ON public.property_sync_jobs TO service_role;
ALTER TABLE public.property_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psj_select" ON public.property_sync_jobs FOR SELECT TO authenticated USING (true);
CREATE TRIGGER psj_touch BEFORE UPDATE ON public.property_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.property_sync_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.property_sync_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  correlation_id uuid,
  step text,
  http_status integer,
  duration_ms integer,
  ok boolean NOT NULL DEFAULT false,
  error_category text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psa_job_idx ON public.property_sync_attempts (job_id, created_at DESC);
GRANT SELECT ON public.property_sync_attempts TO authenticated;
GRANT ALL ON public.property_sync_attempts TO service_role;
ALTER TABLE public.property_sync_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psa_select" ON public.property_sync_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- aquisição segura de jobs
CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(_worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 120)
RETURNS SETOF public.property_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- devolve jobs abandonados para a fila
  UPDATE public.property_sync_jobs
     SET status = 'retry', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL
   WHERE status = 'processing' AND lock_expires_at IS NOT NULL AND lock_expires_at < now();

  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
      FROM public.property_sync_jobs j
     WHERE j.status IN ('pending','retry')
       AND j.next_run_at <= now()
     ORDER BY j.next_run_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, _limit)
  )
  UPDATE public.property_sync_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         lock_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         locked_by = _worker
    FROM claimed c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.property_sync_claim_jobs(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.property_sync_claim_jobs(text,integer,integer) TO service_role;