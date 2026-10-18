-- Anonymous selections share the module, never the Gestão create/edit/close grants.
-- Only the server may create/read these records; eligibility remains the Cordial projection.
CREATE TABLE public.shared_selection_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_hash text NOT NULL UNIQUE CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  public_ids uuid[] NOT NULL CHECK (cardinality(public_ids) BETWEEN 1 AND 20),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_selection_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_selection_visitors FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shared_selection_visitors TO service_role;
CREATE INDEX shared_selection_visitors_expiry_idx ON public.shared_selection_visitors(expires_at);

CREATE FUNCTION public.shared_selection_visitor_create(p_request_hash text, p_token_hash text, p_public_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ids uuid[]; v_missing uuid[]; v_row public.shared_selection_visitors;
BEGIN
  IF p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'invalid_request'; END IF;
  IF p_public_ids IS NULL OR cardinality(p_public_ids) NOT BETWEEN 1 AND 20 OR array_position(p_public_ids,NULL) IS NOT NULL
    THEN RETURN jsonb_build_object('ok',false,'error','limit'); END IF;
  SELECT array_agg(id ORDER BY first_position) INTO v_ids FROM (
    SELECT id,min(position) AS first_position FROM unnest(p_public_ids) WITH ORDINALITY t(id,position) GROUP BY id
  ) d;
  -- Serializes retries of the same request, including concurrent tabs/retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_hash, 0));
  SELECT * INTO v_row FROM public.shared_selection_visitors WHERE request_hash=p_request_hash;
  IF FOUND THEN
    IF v_row.public_ids IS DISTINCT FROM v_ids OR v_row.token_hash IS DISTINCT FROM p_token_hash
      THEN RETURN jsonb_build_object('ok',false,'error','request_reused'); END IF;
    IF v_row.expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'error','expired'); END IF;
    RETURN jsonb_build_object('ok',true,'expiresAt',v_row.expires_at);
  END IF;
  SELECT array_agg(i.id) INTO v_missing FROM unnest(v_ids) i(id)
  WHERE NOT EXISTS(SELECT 1 FROM public.cordial_site_documents d WHERE d.public_id=i.id);
  IF cardinality(v_missing)>0 THEN RETURN jsonb_build_object('ok',false,'error','unavailable'); END IF;
  INSERT INTO public.shared_selection_visitors(request_hash,token_hash,public_ids)
    VALUES(p_request_hash,p_token_hash,v_ids) RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok',true,'expiresAt',v_row.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_visitor_create(text,text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_selection_visitor_create(text,text,uuid[]) TO service_role;

CREATE FUNCTION public.shared_selection_visitor_public(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.shared_selection_visitors; v_items jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('state','invalid'); END IF;
  SELECT * INTO v_row FROM public.shared_selection_visitors WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','invalid'); END IF;
  IF v_row.expires_at<=now() THEN RETURN jsonb_build_object('state','expired'); END IF;
  SELECT jsonb_agg(CASE WHEN d.public_id IS NULL THEN jsonb_build_object('available',false,'key',i.position)
    ELSE jsonb_build_object('available',true,'key',i.position,'property',
      (d.document - 'address' - 'description' - 'features') || jsonb_build_object('address',NULL,'description','','features','[]'::jsonb))
    END ORDER BY i.position) INTO v_items
  FROM unnest(v_row.public_ids) WITH ORDINALITY i(id,position)
  LEFT JOIN public.cordial_site_documents d ON d.public_id=i.id;
  RETURN jsonb_build_object('state','ok','expiresAt',v_row.expires_at,'items',coalesce(v_items,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.shared_selection_visitor_public(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shared_selection_visitor_public(text) TO service_role;
