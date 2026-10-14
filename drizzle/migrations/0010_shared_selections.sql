CREATE TABLE IF NOT EXISTS public.shared_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency text NOT NULL DEFAULT 'cordial' CHECK (agency IN ('cordial','morar')),
  owner_id uuid NOT NULL,
  corretor_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  public_message text NOT NULL DEFAULT '' CHECK (char_length(public_message) <= 1000),
  internal_client_name text NOT NULL DEFAULT '' CHECK (char_length(internal_client_name) <= 120),
  whatsapp text NOT NULL DEFAULT '' CHECK (whatsapp ~ '^(\d{10,15})?$'),
  token text NOT NULL UNIQUE,
  client_request_id text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','encerrada')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_request_id)
);
GRANT SELECT ON public.shared_selections TO authenticated;
GRANT ALL ON public.shared_selections TO service_role;
ALTER TABLE public.shared_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_selections_read ON public.shared_selections FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR corretor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria'));

CREATE TABLE IF NOT EXISTS public.shared_selection_items (
  selection_id uuid NOT NULL REFERENCES public.shared_selections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY (selection_id, property_id)
);
CREATE INDEX IF NOT EXISTS shared_selection_items_order_idx ON public.shared_selection_items (selection_id, position);
GRANT SELECT ON public.shared_selection_items TO authenticated;
GRANT ALL ON public.shared_selection_items TO service_role;
ALTER TABLE public.shared_selection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_selection_items_read ON public.shared_selection_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.shared_selections s WHERE s.id = selection_id));

-- Regra única de divulgação pública para seleções.
CREATE OR REPLACE FUNCTION public.shared_selection_property_eligible(p public.properties)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.archived_at IS NULL
     AND coalesce(p.is_draft, false) = false
     AND coalesce(p.exibir_imovel, true) = true
     AND lower(trim(coalesce(p.disponibilidade, ''))) IN ('', 'sim', 'disponível', 'disponivel')
$$;

CREATE OR REPLACE FUNCTION public.shared_selection_check(p_ids uuid[])
RETURNS TABLE(property_id uuid, eligible boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, coalesce(public.shared_selection_property_eligible(p), false)
  FROM unnest(p_ids) AS i(id) LEFT JOIN public.properties p ON p.id = i.id
  WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.shared_selection_check(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_check(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_selection_can_manage(s public.shared_selections)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.owner_id = auth.uid() OR s.corretor_id = auth.uid()
      OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
$$;

-- Cria ou atualiza seleção e itens de forma atômica e idempotente.
CREATE OR REPLACE FUNCTION public.shared_selection_save(
  p_id uuid, p_request_id text, p_agency text, p_title text, p_message text,
  p_client text, p_whatsapp text, p_expires_at timestamptz, p_property_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sel public.shared_selections;
  v_bad uuid[];
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'secretaria') OR public.has_role(v_uid,'corretor')) THEN
    RAISE EXCEPTION 'sem_permissao';
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
    VALUES (p_agency, v_uid, v_uid, trim(p_title), coalesce(p_message,''), coalesce(p_client,''), coalesce(p_whatsapp,''),
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), p_request_id, p_expires_at)
    RETURNING * INTO v_sel;
  ELSE
    SELECT * INTO v_sel FROM public.shared_selections WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR NOT public.shared_selection_can_manage(v_sel) THEN RAISE EXCEPTION 'nao_encontrada'; END IF;
    IF v_sel.status <> 'ativa' THEN RETURN jsonb_build_object('ok', false, 'error', 'encerrada'); END IF;
    UPDATE public.shared_selections SET agency = p_agency, title = trim(p_title), public_message = coalesce(p_message,''),
      internal_client_name = coalesce(p_client,''), whatsapp = coalesce(p_whatsapp,''), expires_at = p_expires_at,
      revision = revision + 1, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_sel;
    DELETE FROM public.shared_selection_items WHERE selection_id = p_id;
  END IF;
  INSERT INTO public.shared_selection_items (selection_id, property_id, position)
  SELECT v_sel.id, id, ord::int FROM unnest(v_ids) WITH ORDINALITY AS t(id, ord);
  RETURN jsonb_build_object('ok', true, 'id', v_sel.id, 'token', v_sel.token);
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_save(uuid,text,text,text,text,text,text,timestamptz,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.shared_selection_close(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sel public.shared_selections;
BEGIN
  SELECT * INTO v_sel FROM public.shared_selections WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.shared_selection_can_manage(v_sel) THEN RAISE EXCEPTION 'nao_encontrada'; END IF;
  UPDATE public.shared_selections SET status = 'encerrada', updated_at = now() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_close(uuid) TO authenticated;

-- Leitura pública por token: lista fechada de campos.
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
        'available', true, 'id', p.id,
        'reference', coalesce(nullif(CASE WHEN v_sel.agency='morar' THEN p.codigo_morar ELSE p.codigo_cordial END,''), nullif(p.codigo_cordial,''), nullif(p.codigo_morar,''), p.codigo),
        'type', p.tipo, 'operation', p.operacao,
        'price', CASE WHEN p.valor_modo = 'consulte' THEN NULL ELSE p.valor END,
        'condo', p.valor_condominio, 'iptu', p.valor_iptu,
        'district', p.bairro, 'city', p.cidade,
        'bedrooms', p.dormitorios, 'bathrooms', p.banheiros, 'parking', p.vagas, 'area', p.area_principal,
        'photos', coalesce((SELECT jsonb_agg(coalesce(im.processed_storage_path, im.storage_path) ORDER BY im.position)
           FROM (SELECT * FROM public.property_images im WHERE im.property_id = p.id AND coalesce(im.pending_remote_delete,false) = false ORDER BY im.position LIMIT 30) im), '[]'::jsonb))
      ELSE jsonb_build_object('available', false) END AS item
    FROM public.shared_selection_items i LEFT JOIN public.properties p ON p.id = i.property_id
    WHERE i.selection_id = v_sel.id) x;
  RETURN jsonb_build_object('state','ok','agency',v_sel.agency,'title',v_sel.title,'message',v_sel.public_message,
    'broker', coalesce(v_nome,''), 'whatsapp', v_sel.whatsapp, 'expires_at', v_sel.expires_at, 'items', v_items);
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shared_selection_public(text) TO anon, authenticated, service_role;