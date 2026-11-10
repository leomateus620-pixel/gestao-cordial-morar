CREATE OR REPLACE FUNCTION public.cordial_site_request_publication(_property_id uuid, _requested_by uuid, _publish boolean, _expected_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p properties; s cordial_site_publications; code text; unchanged boolean := false; reason text;
BEGIN
 IF NOT public.cordial_site_can_publish(_requested_by) THEN RAISE EXCEPTION 'Forbidden Cordial scope'; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'notFound',true); END IF;
 IF _expected_revision IS NOT NULL AND p.revision<>_expected_revision THEN
  RETURN jsonb_build_object('ok',false,'conflict',true,'revision',p.revision);
 END IF;
 IF _publish AND (p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL) THEN
  RAISE EXCEPTION 'Imóvel arquivado: reative o cadastro antes de publicar.';
 END IF;
 SELECT * INTO s FROM cordial_site_publications WHERE property_id=p.id FOR UPDATE;
 IF FOUND AND s.own_decision = (CASE WHEN _publish THEN 'publish' ELSE 'withdraw' END) AND s.decision_revision = p.revision THEN
  unchanged := true;
 ELSE
  code:=NULLIF(btrim(p.codigo_cordial),'');
  IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
  INSERT INTO cordial_site_publications(property_id,public_reference,state,cordial_authorized,availability_confirmed,area_units_confirmed,own_decision,decision_revision,decision_by,decision_at,decision_source)
  VALUES(p.id,code,'withdrawn',p.autorizacao IS TRUE,p.disponibilidade IS NOT NULL,false,(CASE WHEN _publish THEN 'publish' ELSE 'withdraw' END),p.revision,_requested_by,now(),'user')
  ON CONFLICT(property_id) DO UPDATE SET own_decision=excluded.own_decision,decision_revision=excluded.decision_revision,decision_by=excluded.decision_by,decision_at=now(),updated_at=now(),
    decision_source=CASE WHEN excluded.own_decision='publish' AND cordial_site_publications.decision_source='legacy_migrated' THEN 'legacy_migrated' ELSE 'user' END;
  PERFORM public.cordial_site_sync_property(p.id);
 END IF;
 SELECT * INTO s FROM cordial_site_publications WHERE property_id=p.id;
 IF _publish AND s.state<>'published' THEN
  reason := CASE
   WHEN p.is_draft IS NOT FALSE THEN 'Cadastro não concluído'
   WHEN p.exibir_imovel IS NOT TRUE THEN 'Imóvel marcado para não exibir'
   WHEN p.operacao NOT IN ('venda','aluguel') OR p.operacao IS NULL THEN 'Finalidade inválida'
   WHEN p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível') THEN 'Disponibilidade não confirmada'
   WHEN p.registration_completed_at IS NULL AND p.source='gestao_cordial' THEN 'Cadastro não concluído'
   ELSE 'Aguardando fotos' END;
 END IF;
 RETURN jsonb_build_object('ok',true,'state',s.state,'active',s.state='published','publicId',s.public_id,
   'unchanged',unchanged,'decision',s.own_decision,'revision',s.decision_revision,
   'pendingReview',_publish AND s.state<>'published','blockReason',reason);
END $function$;

CREATE OR REPLACE FUNCTION public.cordial_site_sync_property(_property_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p properties; s cordial_site_publications; compatible boolean; legacy boolean; released boolean; code text;
BEGIN
  SELECT * INTO p FROM properties WHERE id=_property_id;
  SELECT * INTO s FROM cordial_site_publications WHERE property_id=_property_id FOR UPDATE;
  IF s.property_id IS NOT NULL AND s.own_decision='withdraw' THEN
    IF s.state='published' THEN UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id; END IF;
    RETURN;
  END IF;
  legacy := coalesce(s.decision_source,'')='legacy_migrated';
  released := s.admin_release_at IS NOT NULL;
  compatible := p.id IS NOT NULL AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
    AND p.operacao IN ('venda','aluguel')
    AND CASE WHEN legacy THEN p.autorizacao IS DISTINCT FROM false
              AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
         WHEN released THEN (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
              AND (s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'cordial'))
         ELSE (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
              AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL)
              AND (s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'cordial')) END;
  IF NOT (compatible AND s.own_decision IS NOT DISTINCT FROM 'publish') THEN
    IF s.property_id IS NOT NULL AND s.state='published' THEN
      UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id;
    END IF;
    RETURN;
  END IF;
  code:=NULLIF(btrim(p.codigo_cordial),'');
  IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
  UPDATE cordial_site_publications SET state='published',cordial_authorized=true,availability_confirmed=true,
    reviewed_content_hash=cordial_site_content_hash(p),
    published_at=coalesce(published_at,now()),updated_at=now()
  WHERE property_id=p.id AND (state<>'published' OR cordial_authorized IS NOT TRUE OR availability_confirmed IS NOT TRUE OR reviewed_content_hash IS DISTINCT FROM cordial_site_content_hash(p));
  INSERT INTO cordial_site_media(image_id,approved_signature)
  SELECT i.id,cordial_site_image_signature(i) FROM property_images i WHERE i.property_id=p.id AND i.processing_status IN ('legacy','ready')
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature
  WHERE cordial_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $function$;

CREATE OR REPLACE FUNCTION public.morar_site_sync_property(_property_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p properties; s morar_site_publications; compatible boolean; approved boolean; released boolean;
BEGIN
 SELECT * INTO s FROM morar_site_publications WHERE property_id=_property_id FOR UPDATE;
 IF NOT FOUND OR s.manual_withdrawn THEN RETURN; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF p.removal_state IS NOT NULL OR p.archived_at IS NOT NULL THEN
  UPDATE morar_site_publications SET state='withdrawn',manual_withdrawn=true,updated_at=now(),decision_revision=p.revision WHERE property_id=p.id;
  RETURN;
 END IF;
 released := s.admin_release_at IS NOT NULL;
 compatible:=p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND (released OR p.autorizacao IS DISTINCT FROM false OR p.registration_completed_at IS NOT NULL)
  AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
  AND p.operacao IN ('venda','aluguel') AND (released OR p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL)
  AND (p.source IS DISTINCT FROM 'gestao_cordial' OR s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'morar'));
 IF s.decision_source='registration' THEN
  s.morar_authorized:=s.morar_authorized OR p.autorizacao IS TRUE OR p.registration_completed_at IS NOT NULL;
  s.availability_confirmed:=s.availability_confirmed OR (p.registration_completed_at IS NOT NULL AND p.disponibilidade IS NULL) OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'));
 END IF;
 approved:=compatible AND ((s.morar_authorized AND s.availability_confirmed) OR released);
 UPDATE morar_site_publications SET state=CASE WHEN approved THEN 'published' ELSE 'draft' END,
  morar_authorized=s.morar_authorized,availability_confirmed=s.availability_confirmed,
  reviewed_content_hash=morar_site_content_hash(p),published_at=CASE WHEN approved THEN coalesce(s.published_at,now()) ELSE s.published_at END,
  decision_revision=p.revision,updated_at=now()
 WHERE property_id=p.id AND (state IS DISTINCT FROM CASE WHEN approved THEN 'published' ELSE 'draft' END OR reviewed_content_hash IS DISTINCT FROM morar_site_content_hash(p) OR morar_authorized IS DISTINCT FROM s.morar_authorized OR availability_confirmed IS DISTINCT FROM s.availability_confirmed);
 INSERT INTO morar_site_media(image_id,approved_signature,approved_by)
 SELECT i.id,morar_site_image_signature(i),s.reviewed_by FROM property_images i
 WHERE i.property_id=p.id AND i.processing_status='ready' AND i.processed_storage_path IS NOT NULL
  AND i.watermark_variant IN ('morar','morar-cordial') AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE
 ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=excluded.approved_by,approved_at=now()
 WHERE morar_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $function$;

CREATE OR REPLACE FUNCTION public.morar_site_request_publication(_property_id uuid, _requested_by uuid, _publish boolean, _expected_revision integer DEFAULT NULL::integer, _review_media boolean DEFAULT true, _areas_m2 boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p properties; result uuid; active boolean; code text; pending boolean;
BEGIN
 IF NOT public.morar_site_can_publish(_requested_by) THEN RAISE EXCEPTION 'Forbidden Morar scope'; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'notFound',true); END IF;
 IF _expected_revision IS NOT NULL AND p.revision<>_expected_revision THEN
  RETURN jsonb_build_object('ok',false,'conflict',true,'revision',p.revision);
 END IF;
 IF _publish AND (p.exibir_imovel IS NOT TRUE OR p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.operacao IS NULL OR p.operacao NOT IN ('venda','aluguel') OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível')) OR (p.is_draft IS DISTINCT FROM false AND p.source IS DISTINCT FROM 'gestao_cordial')) THEN
  RAISE EXCEPTION 'Site Morar: imóvel arquivado, oculto, indisponível ou sem finalidade válida.';
 END IF;
 PERFORM set_config('morar_site.actor',_requested_by::text,true);
 pending:=(p.autorizacao IS NOT TRUE OR p.disponibilidade IS NULL) AND p.source IS DISTINCT FROM 'gestao_cordial';
 active:=_publish AND NOT pending AND p.is_draft IS FALSE AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL);
 code:=NULLIF(btrim(p.codigo_morar),'');
 IF code IS NULL OR code ~* '^GC-' THEN code:='M-'||lpad(nextval('morar_site_reference_seq')::text,6,'0'); END IF;
 INSERT INTO morar_site_publications(property_id,public_reference,state,morar_authorized,availability_confirmed,reviewed_content_hash,area_units_confirmed,published_at,reviewed_by,manual_withdrawn,decision_source,decision_revision)
 VALUES(p.id,code,CASE WHEN NOT _publish THEN 'withdrawn' WHEN active THEN 'published' ELSE 'draft' END,p.autorizacao IS TRUE OR NOT pending,p.disponibilidade IS NOT NULL OR NOT pending,morar_site_content_hash(p),_areas_m2,CASE WHEN active THEN now() END,_requested_by,NOT _publish,'registration',p.revision)
 ON CONFLICT(property_id) DO UPDATE SET state=excluded.state,morar_authorized=excluded.morar_authorized,availability_confirmed=excluded.availability_confirmed,reviewed_content_hash=excluded.reviewed_content_hash,area_units_confirmed=excluded.area_units_confirmed,published_at=coalesce(morar_site_publications.published_at,excluded.published_at),reviewed_by=excluded.reviewed_by,manual_withdrawn=excluded.manual_withdrawn,decision_source=excluded.decision_source,decision_revision=excluded.decision_revision,updated_at=now()
 RETURNING public_id INTO result;
 IF _review_media AND _publish THEN
  INSERT INTO morar_site_media(image_id,approved_signature,approved_by)
  SELECT i.id,morar_site_image_signature(i),_requested_by FROM property_images i WHERE i.property_id=p.id AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE AND (i.processing_status='legacy' OR (i.processing_status='ready' AND i.processed_storage_path IS NOT NULL AND i.watermark_variant IN ('morar','morar-cordial')))
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=excluded.approved_by,approved_at=now();
 END IF;
 RETURN jsonb_build_object('ok',true,'publicId',result,'state',CASE WHEN NOT _publish THEN 'withdrawn' WHEN active THEN 'published' ELSE 'draft' END,'active',active,'pendingReview',_publish AND pending,'reason',CASE WHEN _publish AND pending AND p.autorizacao IS NOT TRUE THEN 'authorization_review' WHEN _publish AND pending AND p.disponibilidade IS NULL THEN 'availability_review' WHEN _publish AND NOT active THEN 'registration_pending' END);
END $function$;

CREATE OR REPLACE VIEW public.cordial_site_eligible WITH (security_invoker=true) AS SELECT p.id AS property_id,
    s.public_id,
    s.public_reference,
    s.published_at,
    p.operacao,
    p.tipo,
    NULLIF(NULLIF(btrim(p.cidade), ''::text), '0'::text) AS cidade,
    NULLIF(NULLIF(btrim(p.bairro), ''::text), '0'::text) AS bairro,
    p.uf,
    NULL::text AS endereco,
        CASE
            WHEN p.valor_modo = 'fixo'::text AND p.valor >= 0::numeric THEN p.valor
            ELSE NULL::numeric
        END AS valor,
    p.valor_modo,
    p.dormitorios,
    p.banheiros,
    p.suites,
    p.vagas,
        CASE
            WHEN s.area_units_confirmed THEN p.area_util
            ELSE NULL::numeric
        END AS area_util,
        CASE
            WHEN s.area_units_confirmed THEN p.area_total
            ELSE NULL::numeric
        END AS area_total,
        CASE
            WHEN s.area_units_confirmed THEN p.area_construida
            ELSE NULL::numeric
        END AS area_construida,
        CASE
            WHEN s.area_units_confirmed THEN p.area_terreno
            ELSE NULL::numeric
        END AS area_terreno,
        CASE
            WHEN lower(p.mobiliado) = ANY (ARRAY['true'::text, 'sim'::text]) THEN true
            WHEN lower(p.mobiliado) = ANY (ARRAY['false'::text, 'nao'::text, 'não'::text]) THEN false
            ELSE NULL::boolean
        END AS mobiliado,
    p.permuta,
    p.aceita_financiamento,
    p.estagio_empreendimento,
    p.destaque_inicial,
        CASE
            WHEN cordial_site_has_hidden_address(p.*, p.descricao_imovel) THEN ''::text
            ELSE p.descricao_imovel
        END AS descricao_imovel,
        CASE
            WHEN cordial_site_has_hidden_address(p.*, p.pontos_fortes) THEN NULL::text
            ELSE p.pontos_fortes
        END AS pontos_fortes,
    cordial_site_public_features(p.*) AS caracteristicas
   FROM properties p
     JOIN cordial_site_publications s ON s.property_id = p.id
  WHERE s.state = 'published'::text AND (s.admin_release_at IS NOT NULL OR s.cordial_authorized IS TRUE AND s.availability_confirmed IS TRUE) AND s.published_at IS NOT NULL AND s.reviewed_content_hash = cordial_site_content_hash(p.*) AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL AND (s.admin_release_at IS NOT NULL OR p.autorizacao IS DISTINCT FROM false OR p.registration_completed_at IS NOT NULL) AND (p.disponibilidade IS NULL OR (lower(btrim(p.disponibilidade)) = ANY (ARRAY['sim'::text, 'disponivel'::text, 'disponível'::text]))) AND (p.operacao = ANY (ARRAY['venda'::text, 'aluguel'::text]));

CREATE OR REPLACE VIEW public.morar_site_eligible WITH (security_invoker=true) AS SELECT p.id AS property_id,
    s.public_id,
    s.public_reference,
    s.published_at,
    p.operacao,
    p.tipo,
    NULLIF(NULLIF(btrim(p.cidade), ''::text), '0'::text) AS cidade,
    NULLIF(NULLIF(btrim(p.bairro), ''::text), '0'::text) AS bairro,
    p.uf,
        CASE
            WHEN p.exibir_endereco_site = 'sim'::text THEN concat_ws(', '::text, NULLIF(p.logradouro, ''::text), NULLIF(p.numero, ''::text))
            ELSE NULL::text
        END AS endereco,
        CASE
            WHEN p.valor_modo = 'fixo'::text AND p.valor >= 0::numeric THEN p.valor
            ELSE NULL::numeric
        END AS valor,
    p.valor_modo,
    p.dormitorios,
    p.banheiros,
    p.suites,
    p.vagas,
    morar_site_area_m2(p.area_util, NULL::text, s.area_units_confirmed) AS area_util,
    morar_site_area_m2(p.area_total, p.area_total_unidade, s.area_units_confirmed) AS area_total,
    morar_site_area_m2(p.area_construida, p.area_construida_unidade, s.area_units_confirmed) AS area_construida,
    morar_site_area_m2(p.area_terreno, p.area_terreno_unidade, s.area_units_confirmed) AS area_terreno,
        CASE
            WHEN lower(p.mobiliado) = ANY (ARRAY['true'::text, 'sim'::text]) THEN true
            WHEN lower(p.mobiliado) = ANY (ARRAY['false'::text, 'nao'::text, 'não'::text]) THEN false
            ELSE NULL::boolean
        END AS mobiliado,
    p.permuta,
    p.aceita_financiamento,
    p.estagio_empreendimento,
    p.destaque_inicial,
        CASE
            WHEN morar_site_has_hidden_address(p.*, p.descricao_imovel) THEN ''::text
            ELSE p.descricao_imovel
        END AS descricao_imovel,
        CASE
            WHEN morar_site_has_hidden_address(p.*, p.pontos_fortes) THEN NULL::text
            ELSE p.pontos_fortes
        END AS pontos_fortes,
    morar_site_public_features(p.*) AS caracteristicas
   FROM properties p
     JOIN morar_site_publications s ON s.property_id = p.id
  WHERE s.state = 'published'::text AND (s.admin_release_at IS NOT NULL OR s.morar_authorized IS TRUE AND s.availability_confirmed IS TRUE) AND s.manual_withdrawn IS FALSE AND s.published_at IS NOT NULL AND s.reviewed_content_hash = morar_site_content_hash(p.*) AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL AND (s.admin_release_at IS NOT NULL OR p.source IS DISTINCT FROM 'gestao_cordial'::text OR p.registration_completed_at IS NOT NULL) AND (s.admin_release_at IS NOT NULL OR p.autorizacao IS DISTINCT FROM false OR p.registration_completed_at IS NOT NULL) AND (p.disponibilidade IS NULL OR (lower(btrim(p.disponibilidade)) = ANY (ARRAY['sim'::text, 'disponivel'::text, 'disponível'::text]))) AND (p.operacao = ANY (ARRAY['venda'::text, 'aluguel'::text]));