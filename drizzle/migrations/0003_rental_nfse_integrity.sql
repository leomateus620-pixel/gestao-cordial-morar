-- PROPOSED: requires explicit approval before deployment. No production changes
-- were performed during implementation. No exposed RPC, route or executor added.
-- XML and provider responses contain personal/fiscal data. Keep them server-only;
-- retention duration and eventual disposal require an approved retention policy.
BEGIN;

CREATE SCHEMA IF NOT EXISTS fiscal_private;
REVOKE ALL ON SCHEMA fiscal_private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.nfse_provider_settings
  ADD COLUMN fiscal_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN config_version bigint NOT NULL DEFAULT 1 CHECK (config_version > 0),
  ADD COLUMN fiscal_approved_by uuid,
  ADD COLUMN fiscal_approved_at timestamptz,
  ADD COLUMN fiscal_approved_config_version bigint,
  ADD COLUMN production_authorized_by uuid,
  ADD COLUMN production_authorized_at timestamptz,
  ADD COLUMN production_authorized_config_version bigint,
  ADD CONSTRAINT nfse_fiscal_profile_object CHECK (jsonb_typeof(fiscal_profile) = 'object');

-- Existing values are preserved for review, never promoted to approved defaults.
ALTER TABLE public.nfse_provider_settings
  ALTER COLUMN codigo_item_lista_servico DROP DEFAULT,
  ALTER COLUMN aliquota_iss DROP DEFAULT,
  ALTER COLUMN ibs_cbs_c_ind_op DROP DEFAULT,
  ALTER COLUMN ibs_cbs_cst DROP DEFAULT,
  ALTER COLUMN ibs_cbs_c_class_trib DROP DEFAULT;

CREATE FUNCTION fiscal_private.version_nfse_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.fiscal_profile IS DISTINCT FROM OLD.fiscal_profile OR NEW.modo_teste IS DISTINCT FROM OLD.modo_teste)
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente a administração pode aprovar o perfil fiscal ou alterar o ambiente.' USING ERRCODE = '42501';
  END IF;
  -- Approval metadata comes exclusively from the approval trigger below.
  NEW.fiscal_approved_by := OLD.fiscal_approved_by;
  NEW.fiscal_approved_at := OLD.fiscal_approved_at;
  NEW.fiscal_approved_config_version := OLD.fiscal_approved_config_version;
  NEW.production_authorized_by := OLD.production_authorized_by;
  NEW.production_authorized_at := OLD.production_authorized_at;
  NEW.production_authorized_config_version := OLD.production_authorized_config_version;
  IF (to_jsonb(NEW) - ARRAY['updated_at','config_version','modo_teste',
       'fiscal_approved_by','fiscal_approved_at','fiscal_approved_config_version',
       'production_authorized_by','production_authorized_at','production_authorized_config_version']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['updated_at','config_version','modo_teste',
       'fiscal_approved_by','fiscal_approved_at','fiscal_approved_config_version',
       'production_authorized_by','production_authorized_at','production_authorized_config_version']) THEN
    IF EXISTS (SELECT 1 FROM public.rental_nfse_emissions e
      WHERE e.status IN ('processando','incerto') AND (e.brand = OLD.brand OR
        e.issuer_identity = upper(regexp_replace(OLD.cnpj, '[. /-]', '', 'g')))) THEN
      RAISE EXCEPTION 'Conclua a conferência das operações pendentes antes de alterar a configuração fiscal.' USING ERRCODE = '23514';
    END IF;
    NEW.config_version := OLD.config_version + 1;
    NEW.modo_teste := true;
    NEW.fiscal_approved_by := NULL;
    NEW.fiscal_approved_at := NULL;
    NEW.fiscal_approved_config_version := NULL;
    NEW.production_authorized_by := NULL;
    NEW.production_authorized_at := NULL;
    NEW.production_authorized_config_version := NULL;
  ELSE
    NEW.config_version := OLD.config_version;
    IF NEW.modo_teste IS DISTINCT FROM OLD.modo_teste AND EXISTS (
      SELECT 1 FROM public.rental_nfse_emissions e
      WHERE e.status IN ('processando','incerto') AND (e.brand = OLD.brand OR
        e.issuer_identity = upper(regexp_replace(OLD.cnpj, '[. /-]', '', 'g')))
    ) THEN
      RAISE EXCEPTION 'Conclua a conferência das operações pendentes antes de alterar o ambiente.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.version_nfse_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_settings_10_version BEFORE UPDATE ON public.nfse_provider_settings
FOR EACH ROW EXECUTE FUNCTION fiscal_private.version_nfse_settings();

CREATE FUNCTION fiscal_private.approve_nfse_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT (TG_OP = 'INSERT' AND NEW.fiscal_profile = '{}'::jsonb AND NEW.modo_teste)
     AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Somente a administração pode registrar aprovação fiscal.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.rental_nfse_emissions e
    WHERE e.status IN ('processando','incerto') AND (e.brand = OLD.brand OR
      e.issuer_identity = upper(regexp_replace(OLD.cnpj, '[. /-]', '', 'g')))) THEN
    RAISE EXCEPTION 'Conclua a conferência das operações pendentes antes de reaprovar o perfil fiscal.' USING ERRCODE = '23514';
  END IF;
  NEW.fiscal_approved_by := NULL;
  NEW.fiscal_approved_at := NULL;
  NEW.fiscal_approved_config_version := NULL;
  NEW.production_authorized_by := NULL;
  NEW.production_authorized_at := NULL;
  NEW.production_authorized_config_version := NULL;
  -- Saving material fields while carrying the old approval reference is not
  -- renewed approval. First persist the changed version; then explicitly approve
  -- that stable version in a separate UPDATE OF fiscal_profile.
  IF TG_OP = 'UPDATE' AND NEW.config_version IS DISTINCT FROM OLD.config_version AND
     NEW.fiscal_profile->>'approvalReference' IS NOT DISTINCT FROM OLD.fiscal_profile->>'approvalReference' THEN
    RETURN NEW;
  END IF;
  IF coalesce(length(btrim(NEW.fiscal_profile->>'approvalReference')), 0) >= 15 THEN
    NEW.fiscal_approved_by := auth.uid();
    NEW.fiscal_approved_at := now();
    NEW.fiscal_approved_config_version := NEW.config_version;
    IF coalesce(length(btrim(NEW.fiscal_profile->>'productionAuthorization')), 0) >= 15 THEN
      NEW.production_authorized_by := auth.uid();
      NEW.production_authorized_at := now();
      NEW.production_authorized_config_version := NEW.config_version;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.approve_nfse_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_settings_20_approval BEFORE INSERT OR UPDATE OF fiscal_profile ON public.nfse_provider_settings
FOR EACH ROW EXECUTE FUNCTION fiscal_private.approve_nfse_settings();

CREATE FUNCTION fiscal_private.guard_nfse_production() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT NEW.modo_teste AND (
    NEW.fiscal_approved_by IS NULL OR NEW.fiscal_approved_config_version IS DISTINCT FROM NEW.config_version OR
    NEW.production_authorized_by IS NULL OR NEW.production_authorized_config_version IS DISTINCT FROM NEW.config_version OR
    NOT EXISTS (SELECT 1 FROM public.rental_nfse_emissions e WHERE e.brand = NEW.brand
      AND e.config_version = NEW.config_version AND e.status = 'teste_ok' AND e.modo_teste = true)
  ) THEN
    RAISE EXCEPTION 'Produção exige aprovação administrativa e validação em teste desta versão.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.guard_nfse_production() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_settings_30_production BEFORE INSERT OR UPDATE ON public.nfse_provider_settings
FOR EACH ROW EXECUTE FUNCTION fiscal_private.guard_nfse_production();

CREATE FUNCTION fiscal_private.retain_nfse_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rental_nfse_emissions e WHERE e.brand = OLD.brand) THEN
    RAISE EXCEPTION 'Configuração vinculada a histórico fiscal deve ser preservada.' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.retain_nfse_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_settings_retain BEFORE DELETE ON public.nfse_provider_settings
FOR EACH ROW EXECUTE FUNCTION fiscal_private.retain_nfse_settings();

CREATE TABLE public.rental_nfse_service_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('payment','manual_review')),
  source_key text NOT NULL,
  vencimento_original date,
  competencia date CHECK (competencia IS NULL OR extract(day FROM competencia) = 1),
  fato_gerador date,
  valor_servico numeric(14,2),
  contract_snapshot jsonb NOT NULL CHECK (jsonb_typeof(contract_snapshot) = 'object'),
  decision jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(decision) = 'object'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, source_key),
  CHECK (source <> 'manual_review' OR
    (competencia IS NOT NULL AND fato_gerador IS NOT NULL AND valor_servico > 0 AND
      coalesce(length(btrim(decision->>'reason')), 0) >= 10))
);
ALTER TABLE public.rental_nfse_service_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_nfse_service_references FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.rental_nfse_service_references TO service_role;
CREATE INDEX rental_nfse_references_contract_idx
  ON public.rental_nfse_service_references (contract_id, created_at DESC);
ALTER TABLE public.rental_contracts ADD COLUMN last_payment_reference_id uuid
  REFERENCES public.rental_nfse_service_references(id) ON DELETE RESTRICT;

CREATE FUNCTION fiscal_private.capture_rental_payment_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE tenant jsonb;
BEGIN
  IF NEW.payment_status::text = 'pago' AND
     (OLD.payment_status::text IS DISTINCT FROM 'pago' OR
      NEW.proximo_vencimento IS DISTINCT FROM OLD.proximo_vencimento) THEN
    IF OLD.proximo_vencimento IS NULL THEN
      RAISE EXCEPTION 'Revise o vencimento da ocorrência antes de registrar a baixa.' USING ERRCODE = '23514';
    END IF;
    SELECT jsonb_build_object('id', t.id, 'nome', t.nome, 'cpf_cnpj', t.cpf_cnpj,
      'email', t.email, 'telefone', t.telefone, 'endereco', t.endereco)
      INTO tenant FROM public.rental_tenants t WHERE t.id = OLD.tenant_id;
    INSERT INTO public.rental_nfse_service_references
      (contract_id, source, source_key, vencimento_original, valor_servico,
       contract_snapshot, decision, created_by)
    VALUES (OLD.id, 'payment', 'payment:' || OLD.proximo_vencimento::text,
      OLD.proximo_vencimento, OLD.comissao_mensal,
      jsonb_build_object('brand', OLD.brand, 'valor_mensal', OLD.valor_mensal,
        'comissao_mensal', OLD.comissao_mensal, 'tenant_id', OLD.tenant_id,
        'tenant', tenant, 'property_id', OLD.property_id,
        'contract_updated_at', OLD.updated_at),
      jsonb_build_object('status', 'fiscal_review_required',
        'origin', 'contract_before_payment',
        'note', 'Baixa preserva os dados observados; não aprova competência, tomador nem enquadramento fiscal.'),
      auth.uid())
    ON CONFLICT (contract_id, source_key) DO NOTHING;
    SELECT r.id INTO NEW.last_payment_reference_id
      FROM public.rental_nfse_service_references r
      WHERE r.contract_id = OLD.id AND r.source_key = 'payment:' || OLD.proximo_vencimento::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.capture_rental_payment_reference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rental_payment_fiscal_reference BEFORE UPDATE ON public.rental_contracts
FOR EACH ROW EXECUTE FUNCTION fiscal_private.capture_rental_payment_reference();

ALTER TABLE public.rental_nfse_emissions
  DROP CONSTRAINT rental_nfse_emissions_contract_id_fkey,
  ADD CONSTRAINT rental_nfse_emissions_contract_id_fkey
    FOREIGN KEY (contract_id) REFERENCES public.rental_contracts(id) ON DELETE RESTRICT,
  ADD COLUMN issuer_identity text,
  ADD COLUMN service_reference_id uuid REFERENCES public.rental_nfse_service_references(id) ON DELETE RESTRICT,
  ADD COLUMN snapshot jsonb,
  ADD COLUMN snapshot_hash text,
  ADD COLUMN config_version bigint,
  ADD COLUMN attempt_id uuid,
  ADD COLUMN parser_version text,
  ADD COLUMN response_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN transport text,
  ADD COLUMN transition_actor uuid,
  ADD COLUMN transition_reason text,
  ADD COLUMN transition_details jsonb;

-- Do not reconstruct historical issuer identity from today's mutable settings.
-- Legacy unresolved records need explicit reconciliation before new transmission.
CREATE UNIQUE INDEX rental_nfse_issuer_active_uniq
  ON public.rental_nfse_emissions (issuer_identity)
  WHERE issuer_identity IS NOT NULL AND status IN ('processando','incerto');
CREATE UNIQUE INDEX rental_nfse_issuer_identifier_uniq
  ON public.rental_nfse_emissions (issuer_identity, identificador, modo_teste)
  WHERE issuer_identity IS NOT NULL;
CREATE UNIQUE INDEX rental_nfse_real_revision_parent_uniq
  ON public.rental_nfse_emissions ((snapshot #>> '{review,replacesEmissionId}'))
  WHERE modo_teste = false AND snapshot #>> '{review,replacesEmissionId}' IS NOT NULL;

ALTER TABLE public.rental_nfse_emission_events
  DROP CONSTRAINT rental_nfse_emission_events_emission_id_fkey,
  ADD CONSTRAINT rental_nfse_emission_events_emission_id_fkey
    FOREIGN KEY (emission_id) REFERENCES public.rental_nfse_emissions(id) ON DELETE RESTRICT,
  ADD COLUMN attempt_id uuid,
  ADD COLUMN evidence_kind text NOT NULL DEFAULT 'transition'
    CHECK (evidence_kind IN ('transition','late_response','diagnostic'));
ALTER TABLE public.rental_nfse_emission_events
  ALTER COLUMN to_status DROP NOT NULL,
  ADD CONSTRAINT rental_nfse_event_transition_semantics CHECK (
    (evidence_kind = 'transition' AND to_status IS NOT NULL) OR
    (evidence_kind <> 'transition' AND from_status IS NULL AND to_status IS NULL)
  );

CREATE FUNCTION fiscal_private.protect_nfse_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE settings public.nfse_provider_settings%ROWTYPE;
  contract public.rental_contracts%ROWTYPE;
  expected_settings jsonb;
  previous public.rental_nfse_emissions%ROWTYPE;
  parent_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Histórico fiscal deve ser preservado; exclusão não autorizada.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.rental_nfse_emissions e
      WHERE e.issuer_identity IS NULL AND e.status IN ('processando','incerto')) THEN
      RAISE EXCEPTION 'Concilie o processamento legado sem identidade comprovada antes de transmitir outra operação.' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> 'processando' OR NEW.attempt_id IS NULL OR NEW.issuer_identity IS NULL
       OR NEW.issuer_identity !~ '^[A-Z0-9]{12}[0-9]{2}$'
       OR NEW.snapshot_hash IS NULL OR NEW.snapshot IS NULL OR NEW.config_version IS NULL
       OR NEW.identificador IS NULL OR NEW.service_reference_id IS NULL THEN
      RAISE EXCEPTION 'Emissão exige tentativa persistida, identidade, referência e revisão fiscal.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.rental_nfse_service_references r
      WHERE r.id = NEW.service_reference_id AND r.contract_id = NEW.contract_id
        AND r.competencia = NEW.competencia AND r.valor_servico = NEW.valor
    ) THEN
      RAISE EXCEPTION 'A referência revisada deve corresponder ao contrato, competência e valor da emissão.' USING ERRCODE = '23514';
    END IF;
    -- Lock the configuration and contract versions until the durable intent and
    -- event commit. A change between preview/confirmation and INSERT fails closed.
    SELECT * INTO settings FROM public.nfse_provider_settings s WHERE s.brand = NEW.brand FOR SHARE;
    IF NOT FOUND OR settings.config_version IS DISTINCT FROM NEW.config_version OR
       upper(regexp_replace(settings.cnpj, '[. /-]', '', 'g')) IS DISTINCT FROM NEW.issuer_identity OR
       settings.fiscal_approved_by IS NULL OR
       settings.fiscal_approved_config_version IS DISTINCT FROM settings.config_version THEN
      RAISE EXCEPTION 'A configuração ou aprovação fiscal mudou. Revise uma nova prévia.' USING ERRCODE = '23514';
    END IF;
    expected_settings := jsonb_build_object(
      'brand', settings.brand, 'cnpj', settings.cnpj, 'inscricao_municipal', settings.inscricao_municipal,
      'razao_social', settings.razao_social, 'cidade_tom', settings.cidade_tom,
      'codigo_ibge_municipio', settings.codigo_ibge_municipio, 'endpoint_url', settings.endpoint_url,
      'codigo_item_lista_servico', settings.codigo_item_lista_servico, 'codigo_nbs', settings.codigo_nbs,
      'aliquota_iss', settings.aliquota_iss, 'situacao_tributaria', settings.situacao_tributaria,
      'tributa_municipio_prestador', settings.tributa_municipio_prestador,
      'ibs_cbs_c_ind_op', settings.ibs_cbs_c_ind_op, 'ibs_cbs_cst', settings.ibs_cbs_cst,
      'ibs_cbs_c_class_trib', settings.ibs_cbs_c_class_trib, 'simples_nacional', settings.simples_nacional);
    IF NEW.snapshot->'profile' IS DISTINCT FROM settings.fiscal_profile OR
       NEW.snapshot->'fiscalSettings' IS DISTINCT FROM expected_settings OR
       NEW.snapshot->>'configVersion' IS DISTINCT FROM NEW.config_version::text OR
       NEW.snapshot->>'issuerIdentity' IS DISTINCT FROM NEW.issuer_identity OR
       NEW.snapshot->>'brand' IS DISTINCT FROM NEW.brand THEN
      RAISE EXCEPTION 'O snapshot não corresponde ao perfil e prestador atualmente aprovados.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO contract FROM public.rental_contracts c WHERE c.id = NEW.contract_id FOR SHARE;
    IF NOT FOUND OR NEW.snapshot->>'contractId' IS DISTINCT FROM NEW.contract_id::text OR
       (NEW.snapshot->>'contractRevision')::timestamptz IS DISTINCT FROM contract.updated_at OR
       contract.brand::text NOT IN (NEW.brand, 'ambas') THEN
      RAISE EXCEPTION 'O contrato mudou após a revisão. Atualize a prévia antes de confirmar.' USING ERRCODE = '23514';
    END IF;
    IF NEW.transition_actor IS NULL OR NEW.created_by IS DISTINCT FROM NEW.transition_actor OR
       NOT (public.has_role(NEW.transition_actor, 'admin') OR public.has_role(NEW.transition_actor, 'financeiro')) THEN
      RAISE EXCEPTION 'A emissão exige responsável fiscal autorizado e rastreável.' USING ERRCODE = '42501';
    END IF;
    IF NOT NEW.modo_teste AND (settings.modo_teste OR
       NEW.confirmacao_real_por IS DISTINCT FROM NEW.transition_actor OR
       settings.production_authorized_by IS NULL OR
       settings.production_authorized_config_version IS DISTINCT FROM settings.config_version OR
       NOT EXISTS (SELECT 1 FROM public.rental_nfse_emissions e WHERE e.brand = NEW.brand
         AND e.config_version = settings.config_version AND e.status = 'teste_ok' AND e.modo_teste)) THEN
      RAISE EXCEPTION 'A emissão real exige ambiente, autorização, confirmação e teste da versão vigente.' USING ERRCODE = '23514';
    END IF;
    IF NOT NEW.modo_teste THEN
      IF EXISTS (SELECT 1 FROM public.rental_nfse_emissions e WHERE e.contract_id = NEW.contract_id
        AND e.competencia = NEW.competencia AND NOT e.modo_teste
        AND e.status IN ('processando','incerto','emitida','cancelada')) THEN
        RAISE EXCEPTION 'Competência com operação pendente, emitida ou cancelada não admite nova emissão.' USING ERRCODE = '23514';
      END IF;
      parent_id := NEW.snapshot #>> '{review,replacesEmissionId}';
      IF parent_id IS NULL AND EXISTS (SELECT 1 FROM public.rental_nfse_emissions e
        WHERE e.contract_id = NEW.contract_id AND e.competencia = NEW.competencia AND NOT e.modo_teste) THEN
        RAISE EXCEPTION 'A correção exige vínculo explícito com a operação fiscal anterior.' USING ERRCODE = '23514';
      END IF;
      IF parent_id IS NOT NULL THEN
        SELECT * INTO previous FROM public.rental_nfse_emissions e WHERE e.id::text = parent_id FOR SHARE;
        IF NOT FOUND OR previous.contract_id IS DISTINCT FROM NEW.contract_id OR
           previous.competencia IS DISTINCT FROM NEW.competencia OR previous.modo_teste OR
           previous.issuer_identity IS DISTINCT FROM NEW.issuer_identity OR
           previous.numero_nfse IS NOT NULL OR NOT (
             (previous.status = 'nao_emitida' AND previous.resolved_by IS NOT NULL AND previous.resolved_at IS NOT NULL
               AND coalesce(length(btrim(previous.resolution_reason)), 0) >= 10) OR
             (previous.status = 'erro' AND (previous.transport = 'nao_enviado' OR
               (previous.transport = 'ok' AND previous.response_complete AND
                (previous.http_status BETWEEN 200 AND 299 OR previous.http_status BETWEEN 400 AND 499)))
               AND coalesce(previous.transition_details->>'mode', '') <> 'consulta')
           ) THEN
          RAISE EXCEPTION 'A origem da correção não comprova ausência de emissão para este prestador e competência.' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  ELSE
    -- A failure of the recovery request cannot clear the original uncertainty.
    IF OLD.status = 'processando' AND NEW.status = 'erro' AND EXISTS (
      SELECT 1 FROM public.rental_nfse_emission_events e WHERE e.emission_id = NEW.id
        AND e.attempt_id = NEW.attempt_id AND e.evidence_kind = 'transition'
        AND e.from_status = 'incerto' AND e.to_status = 'processando'
    ) THEN
      NEW.status := 'incerto';
    END IF;
    IF ROW(NEW.contract_id, NEW.brand, NEW.competencia, NEW.valor, NEW.modo_teste,
      NEW.issuer_identity, NEW.identificador, NEW.snapshot, NEW.snapshot_hash,
      NEW.config_version, NEW.service_reference_id, NEW.request_xml)
      IS DISTINCT FROM ROW(OLD.contract_id, OLD.brand, OLD.competencia, OLD.valor,
      OLD.modo_teste, OLD.issuer_identity, OLD.identificador, OLD.snapshot,
      OLD.snapshot_hash, OLD.config_version, OLD.service_reference_id, OLD.request_xml) THEN
      RAISE EXCEPTION 'A identidade e o conteúdo da operação fiscal são imutáveis.' USING ERRCODE = '23514';
    END IF;
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id AND
       (NEW.status <> 'processando' OR NEW.attempts <> OLD.attempts + 1 OR
        OLD.status NOT IN ('erro','incerto')) THEN
      RAISE EXCEPTION 'Nova tentativa exige recuperação explícita e incremento rastreável.' USING ERRCODE = '23514';
    END IF;
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id AND EXISTS (
      SELECT 1 FROM public.rental_nfse_emissions e
      WHERE e.issuer_identity IS NULL AND e.status IN ('processando','incerto') AND e.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Concilie o processamento legado sem identidade comprovada antes de transmitir outra operação.' USING ERRCODE = '23514';
    END IF;
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id THEN
      IF NOT NEW.modo_teste AND EXISTS (SELECT 1 FROM public.rental_nfse_emissions e
        WHERE NOT e.modo_teste AND e.snapshot #>> '{review,replacesEmissionId}' = NEW.id::text) THEN
        RAISE EXCEPTION 'Esta operação já possui revisão vinculada. Continue pela revisão mais recente.' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO settings FROM public.nfse_provider_settings s WHERE s.brand = NEW.brand FOR SHARE;
      IF NOT FOUND OR upper(regexp_replace(settings.cnpj, '[. /-]', '', 'g')) IS DISTINCT FROM NEW.issuer_identity OR
         (NEW.transition_reason = 'reenvio' AND (settings.config_version IS DISTINCT FROM NEW.config_version OR
           settings.fiscal_profile IS DISTINCT FROM NEW.snapshot->'profile')) THEN
        RAISE EXCEPTION 'O prestador ou perfil fiscal mudou antes da recuperação. Revise a configuração original.' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF OLD.status IN ('emitida','cancelada','nao_emitida') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Situação fiscal concluída exige fluxo próprio de revisão.' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'nao_emitida' AND (OLD.status <> 'incerto' OR
       NEW.resolved_by IS NULL OR NEW.resolved_at IS NULL OR
       coalesce(length(btrim(NEW.resolution_reason)), 0) < 10) THEN
      RAISE EXCEPTION 'Liberação exige incerteza, responsável, data e motivo registrado.' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.protect_nfse_operation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_protect_operation BEFORE INSERT OR UPDATE OR DELETE ON public.rental_nfse_emissions
FOR EACH ROW EXECUTE FUNCTION fiscal_private.protect_nfse_operation();

CREATE FUNCTION fiscal_private.record_nfse_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  -- Same transaction: if event insertion fails, the state change rolls back.
  INSERT INTO public.rental_nfse_emission_events
    (emission_id, from_status, to_status, actor, actor_kind, reason, details, attempt_id, evidence_kind)
  VALUES (NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END, NEW.status,
    coalesce(NEW.transition_actor, auth.uid(), NEW.created_by),
    CASE WHEN coalesce(NEW.transition_actor, auth.uid()) IS NULL THEN 'sistema' ELSE 'usuario' END,
    NEW.transition_reason,
    jsonb_build_object('identificador', NEW.identificador, 'issuer_identity', NEW.issuer_identity,
      'snapshot_hash', NEW.snapshot_hash, 'config_version', NEW.config_version,
      'attempts', NEW.attempts, 'request_xml', NEW.request_xml, 'response_raw', NEW.response_raw,
      'http_status', NEW.http_status, 'duration_ms', NEW.duration_ms,
      'response_complete', NEW.response_complete, 'transport', NEW.transport,
      'parser_version', NEW.parser_version, 'finished_at', NEW.finished_at,
      'context', NEW.transition_details), NEW.attempt_id, 'transition');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fiscal_private.record_nfse_transition() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_record_transition AFTER INSERT OR UPDATE ON public.rental_nfse_emissions
FOR EACH ROW EXECUTE FUNCTION fiscal_private.record_nfse_transition();

CREATE FUNCTION fiscal_private.retain_nfse_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Referências e evidências fiscais são imutáveis; retenção requer política aprovada.' USING ERRCODE = '23514';
END $$;
REVOKE ALL ON FUNCTION fiscal_private.retain_nfse_evidence() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nfse_retain_events BEFORE UPDATE OR DELETE ON public.rental_nfse_emission_events
FOR EACH ROW EXECUTE FUNCTION fiscal_private.retain_nfse_evidence();
CREATE TRIGGER nfse_retain_references BEFORE UPDATE OR DELETE ON public.rental_nfse_service_references
FOR EACH ROW EXECUTE FUNCTION fiscal_private.retain_nfse_evidence();

-- RLS remains in place for operational rows. SQL privileges, not UI hiding,
-- deny direct browser access to XML, raw responses and diagnostic event payloads.
REVOKE ALL ON public.rental_nfse_emissions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, contract_id, brand, competencia, valor, status, modo_teste,
  numero_nfse, codigo_verificador, link_pdf, created_by, created_at, identificador,
  serie_nfse, data_emissao_nfse, situacao_nfse, attempts, finished_at, updated_at,
  confirmacao_real_por, resolved_by, resolved_at, resolution_reason)
  ON public.rental_nfse_emissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rental_nfse_emissions TO service_role;
REVOKE DELETE ON public.rental_nfse_emissions FROM service_role;
DROP POLICY IF EXISTS rental_nfse_delete_admin ON public.rental_nfse_emissions;
REVOKE ALL ON public.rental_nfse_emission_events FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.rental_nfse_emission_events FROM service_role;
GRANT SELECT, INSERT ON public.rental_nfse_emission_events TO service_role;

COMMIT;
