CREATE OR REPLACE FUNCTION public.cordial_site_request_publication(_property_id uuid, _requested_by uuid, _publish boolean, _expected_revision integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
   WHEN p.autorizacao IS NOT TRUE THEN 'Falta autorização do proprietário'
   WHEN lower(btrim(coalesce(p.disponibilidade,''))) NOT IN ('sim','disponivel','disponível') THEN 'Disponibilidade não confirmada'
   ELSE 'Aguardando revisão' END;
 END IF;
 RETURN jsonb_build_object('ok',true,'state',s.state,'active',s.state='published','publicId',s.public_id,
   'unchanged',unchanged,'decision',s.own_decision,'revision',s.decision_revision,
   'pendingReview',_publish AND s.state<>'published','blockReason',reason);
END $function$;