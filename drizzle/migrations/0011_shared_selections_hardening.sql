REVOKE ALL ON public.shared_selections FROM anon, PUBLIC;
REVOKE ALL ON public.shared_selection_items FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shared_selection_can_manage(public.shared_selections) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shared_selection_property_eligible(public.properties) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_selection_can_manage(public.shared_selections) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shared_selection_property_eligible(public.properties) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.shared_selection_rate_limits (
  bucket text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.shared_selection_rate_limits TO service_role;
ALTER TABLE public.shared_selection_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.shared_selection_take_rate(_bucket text, _limit integer, _seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM shared_selection_rate_limits WHERE expires_at < now() - interval '1 day';
  INSERT INTO shared_selection_rate_limits(bucket, hits, expires_at) VALUES (_bucket, 1, now() + make_interval(secs => _seconds))
  ON CONFLICT (bucket) DO UPDATE SET
    hits = CASE WHEN shared_selection_rate_limits.expires_at < now() THEN 1 ELSE shared_selection_rate_limits.hits + 1 END,
    expires_at = CASE WHEN shared_selection_rate_limits.expires_at < now() THEN excluded.expires_at ELSE shared_selection_rate_limits.expires_at END
  RETURNING hits INTO n;
  RETURN n <= _limit;
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_take_rate(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shared_selection_take_rate(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.shared_selection_public(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
        'photos', coalesce((SELECT jsonb_agg(coalesce(im.processed_storage_path, im.storage_path) ORDER BY im.position)
           FROM (SELECT * FROM public.property_images im WHERE im.property_id = p.id AND coalesce(im.pending_remote_delete,false) = false ORDER BY im.position LIMIT 30) im), '[]'::jsonb))
      ELSE jsonb_build_object('available', false, 'key', i.position) END AS item
    FROM public.shared_selection_items i LEFT JOIN public.properties p ON p.id = i.property_id
    WHERE i.selection_id = v_sel.id) x;
  RETURN jsonb_build_object('state','ok','agency',v_sel.agency,'title',v_sel.title,'message',v_sel.public_message,
    'broker', coalesce(v_nome,''), 'whatsapp', v_sel.whatsapp, 'expires_at', v_sel.expires_at, 'items', v_items);
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_selection_public(text) TO anon, authenticated, service_role;