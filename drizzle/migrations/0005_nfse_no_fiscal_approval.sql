CREATE OR REPLACE FUNCTION fiscal_private.protect_nfse_operation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
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
    -- Aprovação fiscal não é exigida (decisão do usuário); a versão da configuração continua travada.
    SELECT * INTO settings FROM public.nfse_provider_settings s WHERE s.brand = NEW.brand FOR SHARE;
    IF NOT FOUND OR settings.config_version IS DISTINCT FROM NEW.config_version OR
       upper(regexp_replace(settings.cnpj, '[. /-]', '', 'g')) IS DISTINCT FROM NEW.issuer_identity THEN
      RAISE EXCEPTION 'A configuração fiscal mudou. Revise uma nova prévia.' USING ERRCODE = '23514';
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
    IF (coalesce(settings.fiscal_profile, '{}'::jsonb) <> '{}'::jsonb AND NEW.snapshot->'profile' IS DISTINCT FROM settings.fiscal_profile) OR
       NEW.snapshot->'fiscalSettings' IS DISTINCT FROM expected_settings OR
       NEW.snapshot->>'configVersion' IS DISTINCT FROM NEW.config_version::text OR
       NEW.snapshot->>'issuerIdentity' IS DISTINCT FROM NEW.issuer_identity OR
       NEW.snapshot->>'brand' IS DISTINCT FROM NEW.brand THEN
      RAISE EXCEPTION 'O snapshot não corresponde ao perfil e prestador atuais.' USING ERRCODE = '23514';
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
       NEW.confirmacao_real_por IS DISTINCT FROM NEW.transition_actor) THEN
      RAISE EXCEPTION 'A emissão real exige modo teste desligado e confirmação do responsável.' USING ERRCODE = '23514';
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
           (coalesce(settings.fiscal_profile, '{}'::jsonb) <> '{}'::jsonb AND settings.fiscal_profile IS DISTINCT FROM NEW.snapshot->'profile'))) THEN
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
END $function$;

CREATE OR REPLACE FUNCTION fiscal_private.record_nfse_transition()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  -- Atualizações só do arquivamento do PDF não são transição fiscal.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.attempt_id IS NOT DISTINCT FROM OLD.attempt_id
     AND NEW.transition_details IS NOT DISTINCT FROM OLD.transition_details
     AND NEW.response_raw IS NOT DISTINCT FROM OLD.response_raw THEN
    RETURN NEW;
  END IF;
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
END $function$;