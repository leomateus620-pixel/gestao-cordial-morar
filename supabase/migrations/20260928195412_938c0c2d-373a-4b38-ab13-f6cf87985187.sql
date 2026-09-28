CREATE OR REPLACE FUNCTION public.phone_key(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) < 8 THEN NULL
    WHEN length(d) IN (12,13) AND left(d,2) = '55' THEN right(d, 8)
    ELSE right(d, 8) END
  FROM (SELECT regexp_replace(coalesce(_v,''), '\D', '', 'g') AS d) s
$$;

CREATE INDEX IF NOT EXISTS attendances_phone_key_idx ON public.attendances (public.phone_key(telefone));
CREATE INDEX IF NOT EXISTS attendances_email_lower_idx ON public.attendances (lower(trim(email)));
CREATE INDEX IF NOT EXISTS clients_phone_key_idx ON public.clients (public.phone_key(phone));

CREATE OR REPLACE FUNCTION public.find_attendance_contact_matches(_phone text, _email text, _document text)
RETURNS TABLE(source text, id uuid, cliente_nome text, telefone text, email text, corretor_id uuid,
  corretor_nome text, status text, pipeline_stage text, imobiliaria text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := public.phone_key(_phone); e text := nullif(lower(trim(coalesce(_email,''))),'');
  doc text := nullif(regexp_replace(coalesce(_document,''), '\D','','g'),'');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF k IS NULL AND e IS NULL AND doc IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT 'attendance'::text, a.id, a.cliente_nome, a.telefone, a.email, a.corretor_id, a.corretor_nome,
      a.status::text, a.pipeline_stage::text, a.imobiliaria::text, a.created_at, a.updated_at
    FROM public.attendances a
    WHERE (k IS NOT NULL AND public.phone_key(a.telefone) = k)
       OR (e IS NOT NULL AND lower(trim(a.email)) = e)
    ORDER BY a.updated_at DESC LIMIT 20;
  RETURN QUERY
    SELECT 'client'::text, c.id, c.full_name, c.phone, c.email, NULL::uuid, NULL::text,
      NULL::text, NULL::text, NULL::text, c.created_at, c.updated_at
    FROM public.clients c
    WHERE (k IS NOT NULL AND public.phone_key(c.phone) = k)
       OR (e IS NOT NULL AND lower(trim(c.email)) = e)
       OR (doc IS NOT NULL AND length(doc) >= 11 AND regexp_replace(coalesce(c.document,''),'\D','','g') = doc)
    ORDER BY c.updated_at DESC LIMIT 5;
END $$;

REVOKE ALL ON FUNCTION public.find_attendance_contact_matches(text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_attendance_contact_matches(text,text,text) TO authenticated;