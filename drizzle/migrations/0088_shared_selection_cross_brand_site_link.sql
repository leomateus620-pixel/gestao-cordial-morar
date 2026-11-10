CREATE OR REPLACE FUNCTION public.shared_selection_public(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
-- meta_reviewer_entry_guard_v1
IF public.is_meta_reviewer() THEN
 RAISE EXCEPTION 'Acesso interno indisponível para avaliação Meta.' USING ERRCODE='42501';
END IF;
DECLARE v_sel public.shared_selections; v_items jsonb; v_nome text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('state','invalid'); END IF;
  SELECT * INTO v_sel FROM public.shared_selections WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','invalid'); END IF;
  IF v_sel.status <> 'ativa' THEN RETURN jsonb_build_object('state','closed','agency',v_sel.agency); END IF;
  IF v_sel.expires_at IS NOT NULL AND v_sel.expires_at < now() THEN RETURN jsonb_build_object('state','expired','agency',v_sel.agency); END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_sel.corretor_id;
  SELECT coalesce(jsonb_agg(item ORDER BY pos), '[]'::jsonb) INTO v_items FROM (
    SELECT i.position AS pos,
      CASE WHEN p.id IS NOT NULL AND public.shared_selection_property_eligible(p) THEN jsonb_build_object(
        'available', true, 'key', i.position,
        'reference', CASE WHEN v_sel.agency = 'morar'
            THEN coalesce(nullif(trim(p.codigo_morar),''), nullif(trim(p.codigo_cordial),''))
            ELSE coalesce(nullif(trim(p.codigo_cordial),''), nullif(trim(p.codigo_morar),'')) END,
        'type', p.tipo, 'operation', p.operacao,
        'price', CASE WHEN p.valor_modo = 'consulte'
                        OR (nullif(trim(p.valor_exibido),'') IS NOT NULL AND trim(p.valor_exibido) !~ '^[R$\s0-9.,]+$')
                      THEN NULL ELSE p.valor END,
        'condo', p.valor_condominio, 'iptu', p.valor_iptu,
        'location', coalesce(nullif(trim(p.localizacao_exibida),''),
                     nullif(concat_ws(' · ', nullif(trim(p.bairro),''), nullif(trim(p.cidade),'')), '')),
        'bedrooms', p.dormitorios, 'bathrooms', p.banheiros, 'parking', p.vagas, 'area', p.area_principal,
        'site_public_id', coalesce(CASE WHEN v_sel.agency = 'morar' THEN sl.morar_id ELSE sl.cordial_id END,
                                   CASE WHEN v_sel.agency = 'morar' THEN sl.cordial_id ELSE sl.morar_id END),
        'site_brand', CASE
            WHEN (CASE WHEN v_sel.agency = 'morar' THEN sl.morar_id ELSE sl.cordial_id END) IS NOT NULL THEN v_sel.agency
            WHEN (CASE WHEN v_sel.agency = 'morar' THEN sl.cordial_id ELSE sl.morar_id END) IS NOT NULL
              THEN CASE WHEN v_sel.agency = 'morar' THEN 'cordial' ELSE 'morar' END
            ELSE NULL END,
        'photos', coalesce((SELECT jsonb_agg(coalesce(im.processed_storage_path, im.storage_path) ORDER BY im.position)
           FROM (SELECT * FROM public.property_images im WHERE im.property_id = p.id AND coalesce(im.pending_remote_delete,false) = false ORDER BY im.position LIMIT 30) im), '[]'::jsonb))
      ELSE jsonb_build_object('available', false, 'key', i.position) END AS item
    FROM public.shared_selection_items i
    LEFT JOIN public.properties p ON p.id = i.property_id
    LEFT JOIN LATERAL (SELECT
        (SELECT e.public_id::text FROM public.cordial_site_eligible e WHERE e.property_id = p.id LIMIT 1) AS cordial_id,
        (SELECT e.public_id::text FROM public.morar_site_eligible e WHERE e.property_id = p.id LIMIT 1) AS morar_id) sl ON true
    WHERE i.selection_id = v_sel.id) x;
  RETURN jsonb_build_object('state','ok','agency',v_sel.agency,'title',v_sel.title,'message',v_sel.public_message,
    'broker', coalesce(v_nome,''), 'whatsapp', v_sel.whatsapp, 'expires_at', v_sel.expires_at, 'items', v_items);
END;
END;
$function$;