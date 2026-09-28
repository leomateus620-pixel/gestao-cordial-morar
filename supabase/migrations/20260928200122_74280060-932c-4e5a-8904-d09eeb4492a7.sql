DROP FUNCTION IF EXISTS public.find_attendance_contact_matches(text,text,text);
CREATE FUNCTION public.find_attendance_contact_matches(_phone text, _email text, _document text)
RETURNS TABLE(source text, id uuid, cliente_nome text, telefone text, email text, corretor_id text,
  corretor_nome text, status text, pipeline_stage text, imobiliaria text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE k text := public.phone_key(_phone); e text := nullif(lower(trim(coalesce(_email,''))),'');
  doc text := nullif(regexp_replace(coalesce(_document,''), '\D','','g'),'');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF k IS NULL AND e IS NULL AND doc IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT 'attendance'::text, a.id, a.cliente_nome, a.telefone, a.email, a.corretor_id::text, a.corretor_nome,
      a.status::text, a.pipeline_stage::text, a.imobiliaria::text, a.created_at, a.updated_at
    FROM public.attendances a
    WHERE (k IS NOT NULL AND public.phone_key(a.telefone) = k)
       OR (e IS NOT NULL AND lower(trim(a.email)) = e)
    ORDER BY a.updated_at DESC LIMIT 20;
  RETURN QUERY
    SELECT 'client'::text, c.id, c.full_name, c.phone, c.email, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, c.created_at, c.updated_at
    FROM public.clients c
    WHERE (k IS NOT NULL AND public.phone_key(c.phone) = k)
       OR (e IS NOT NULL AND lower(trim(c.email)) = e)
       OR (doc IS NOT NULL AND length(doc) >= 11 AND regexp_replace(coalesce(c.document,''),'\D','','g') = doc)
    ORDER BY c.updated_at DESC LIMIT 5;
END $$;
REVOKE ALL ON FUNCTION public.find_attendance_contact_matches(text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_attendance_contact_matches(text,text,text) TO authenticated;