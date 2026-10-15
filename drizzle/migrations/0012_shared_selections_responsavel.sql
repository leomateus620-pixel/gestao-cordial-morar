CREATE OR REPLACE FUNCTION public.shared_selection_can_choose_responsible(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (public.has_role(_uid,'admin') OR public.has_role(_uid,'secretaria'))
$$;
REVOKE ALL ON FUNCTION public.shared_selection_can_choose_responsible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_can_choose_responsible(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shared_selection_responsibles()
RETURNS TABLE(id uuid, nome text, can_choose boolean, last_whatsapp text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_mgr boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_mgr := public.shared_selection_can_choose_responsible(v_uid);
  RETURN QUERY
  SELECT p.id, coalesce(p.nome,'')::text, v_mgr,
    coalesce((SELECT s.whatsapp FROM public.shared_selections s WHERE s.corretor_id = p.id AND s.whatsapp <> '' ORDER BY s.updated_at DESC LIMIT 1),'')::text
  FROM public.profiles p
  WHERE (p.id = v_uid OR (v_mgr AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role IN ('corretor','admin','secretaria'))))
  ORDER BY (p.id = v_uid) DESC, p.nome;
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_responsibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_responsibles() TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_selection_save(
  p_id uuid, p_request_id text, p_agency text, p_title text, p_message text,
  p_client text, p_whatsapp text, p_expires_at timestamptz, p_property_ids uuid[], p_corretor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sel public.shared_selections;
  v_bad uuid[];
  v_ids uuid[];
  v_mgr boolean;
  v_target uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'secretaria') OR public.has_role(v_uid,'corretor')) THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  v_mgr := public.shared_selection_can_choose_responsible(v_uid);
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_sel FROM public.shared_selections WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT public.shared_selection_can_manage(v_sel) THEN RAISE EXCEPTION 'nao_encontrada'; END IF;
    v_target := coalesce(p_corretor_id, v_sel.corretor_id);
    IF v_target <> v_sel.corretor_id AND NOT v_mgr THEN RAISE EXCEPTION 'responsavel_nao_permitido'; END IF;
  ELSE
    v_target := coalesce(p_corretor_id, v_uid);
    IF v_target <> v_uid AND NOT v_mgr THEN RAISE EXCEPTION 'responsavel_nao_permitido'; END IF;
  END IF;
  IF NOT (public.has_role(v_target,'corretor') OR public.has_role(v_target,'admin') OR public.has_role(v_target,'secretaria')) THEN
    RAISE EXCEPTION 'responsavel_invalido';
  END IF;

  SELECT array_agg(id ORDER BY ord) INTO v_ids FROM (
    SELECT DISTINCT ON (id) id, ord FROM unnest(p_property_ids) WITH ORDINALITY AS t(id, ord) ORDER BY id, ord) d;
  IF v_ids IS NULL OR array_length(v_ids,1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vazia');
  END IF;
  IF array_length(v_ids,1) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite');
  END IF;
  SELECT array_agg(c.property_id) INTO v_bad FROM public.shared_selection_check(v_ids) c WHERE NOT c.eligible;
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'inelegiveis', 'ineligible', to_jsonb(v_bad));
  END IF;

  IF p_id IS NULL THEN
    SELECT * INTO v_sel FROM public.shared_selections WHERE owner_id = v_uid AND client_request_id = p_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'id', v_sel.id, 'token', v_sel.token, 'replayed', true);
    END IF;
    INSERT INTO public.shared_selections (agency, owner_id, corretor_id, title, public_message, internal_client_name, whatsapp, token, client_request_id, expires_at)
    VALUES (p_agency, v_uid, v_target, trim(p_title), coalesce(p_message,''), coalesce(p_client,''), coalesce(p_whatsapp,''),
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), p_request_id, p_expires_at)
    RETURNING * INTO v_sel;
  ELSE
    IF v_sel.status <> 'ativa' THEN RETURN jsonb_build_object('ok', false, 'error', 'encerrada'); END IF;
    UPDATE public.shared_selections SET agency = p_agency, title = trim(p_title), public_message = coalesce(p_message,''),
      internal_client_name = coalesce(p_client,''), whatsapp = coalesce(p_whatsapp,''), expires_at = p_expires_at,
      corretor_id = v_target, revision = revision + 1, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_sel;
    DELETE FROM public.shared_selection_items WHERE selection_id = p_id;
  END IF;
  INSERT INTO public.shared_selection_items (selection_id, property_id, position)
  SELECT v_sel.id, id, ord::int FROM unnest(v_ids) WITH ORDINALITY AS t(id, ord);
  RETURN jsonb_build_object('ok', true, 'id', v_sel.id, 'token', v_sel.token);
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[],uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_selection_save(
  p_id uuid, p_request_id text, p_agency text, p_title text, p_message text,
  p_client text, p_whatsapp text, p_expires_at timestamptz, p_property_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT public.shared_selection_save(p_id, p_request_id, p_agency, p_title, p_message, p_client, p_whatsapp, p_expires_at, p_property_ids, NULL::uuid)
$$;
REVOKE ALL ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[]) TO authenticated;

REVOKE ALL ON public.shared_selection_rate_limits FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.shared_selection_rate_limits TO service_role;