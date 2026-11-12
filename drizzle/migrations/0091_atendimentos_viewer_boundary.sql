-- Consulta de Atendimentos: deny-dominant read-only role (mirrors meta_reviewer).
CREATE OR REPLACE FUNCTION public.is_atendimentos_viewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'atendimentos_viewer')
$$;
REVOKE ALL ON FUNCTION public.is_atendimentos_viewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_atendimentos_viewer() TO authenticated, service_role;
--> statement-breakpoint
-- Both external roles are deny-dominant: they only satisfy a check for themselves.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
 AND (_role::text='meta_reviewer' OR NOT EXISTS(
   SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text='meta_reviewer'))
 AND (_role::text='atendimentos_viewer' OR NOT EXISTS(
   SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text='atendimentos_viewer'))
$$;
--> statement-breakpoint
-- Block the viewer on every RLS table except the read allowlist.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND c.relname NOT IN ('attendances','attendance_history','attendance_assignments','profiles','user_roles','user_agencies')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS atendimentos_viewer_block ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY atendimentos_viewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer())', t.relname);
  END LOOP;
  -- Allowlist tables: SELECT only, never INSERT/UPDATE/DELETE.
  FOR t IN SELECT unnest(ARRAY['attendances','attendance_history','attendance_assignments','profiles','user_roles','user_agencies']) relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS atendimentos_viewer_no_insert ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS atendimentos_viewer_no_update ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS atendimentos_viewer_no_delete ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY atendimentos_viewer_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_atendimentos_viewer())', t.relname);
    EXECUTE format('CREATE POLICY atendimentos_viewer_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer())', t.relname);
    EXECUTE format('CREATE POLICY atendimentos_viewer_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_atendimentos_viewer())', t.relname);
  END LOOP;
END $$;
--> statement-breakpoint
DROP POLICY IF EXISTS atendimentos_viewer_block ON storage.objects;
CREATE POLICY atendimentos_viewer_block ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());
--> statement-breakpoint
-- Read access to the whole funnel of the viewer's agencies.
DROP POLICY IF EXISTS atendimentos_viewer_select ON public.attendances;
CREATE POLICY atendimentos_viewer_select ON public.attendances FOR SELECT TO authenticated
  USING (public.is_atendimentos_viewer() AND public.current_user_has_notification_agency_access(imobiliaria));
DROP POLICY IF EXISTS atendimentos_viewer_select ON public.attendance_assignments;
CREATE POLICY atendimentos_viewer_select ON public.attendance_assignments FOR SELECT TO authenticated
  USING (public.is_atendimentos_viewer() AND public.current_user_has_notification_agency_access(imobiliaria));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.attendance_can_access(_attendance_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$#variable_conflict use_column
BEGIN
-- meta_reviewer_entry_guard_v1
IF public.is_meta_reviewer() THEN
 RAISE EXCEPTION 'Acesso interno indisponível para avaliação Meta.' USING ERRCODE='42501';
END IF;

RETURN (
  SELECT EXISTS (
    SELECT 1
    FROM public.attendances attendance
    WHERE attendance.id = _attendance_id
      AND public.has_notification_agency_access(auth.uid(), attendance.imobiliaria)
      AND (
        attendance.created_by = auth.uid()
        OR attendance.corretor_id = auth.uid()::TEXT
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
        -- read-only: the viewer is refused by every write RPC and RLS write policy
        OR public.is_atendimentos_viewer()
      )
  )
);
END;
$function$;
--> statement-breakpoint
-- Viewer never appears as a broker.
DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.list_corretores'::regproc);
  IF position('atendimentos_viewer' in def) = 0 THEN
    def := replace(def, 'AND p.is_internal = false', 'AND p.is_internal = false AND NOT EXISTS (SELECT 1 FROM public.user_roles v WHERE v.user_id = p.id AND v.role::text = ''atendimentos_viewer'')');
    IF position('atendimentos_viewer' in def) = 0 THEN RAISE EXCEPTION 'list_corretores filter not found'; END IF;
    EXECUTE def;
  END IF;
  def := pg_get_functiondef('public.cordial_site_can_publish'::regproc);
  IF position('atendimentos_viewer' in def) = 0 THEN
    def := replace(def, 'NOT public.has_role(_actor,''meta_reviewer'')', 'NOT public.has_role(_actor,''meta_reviewer'') AND NOT public.has_role(_actor,''atendimentos_viewer'')');
    IF position('atendimentos_viewer' in def) = 0 THEN RAISE EXCEPTION 'cordial_site_can_publish check not found'; END IF;
    EXECUTE def;
  END IF;
END $$;
--> statement-breakpoint
-- Entry guard on every plpgsql SECURITY DEFINER RPC callable by authenticated,
-- except the read helper attendance_can_access. Business bodies are unchanged.
DO $migration$
DECLARE
 f record; body text; directives text;
 guard constant text := E'\n-- atendimentos_viewer_entry_guard_v1\nIF public.is_atendimentos_viewer() THEN\n RAISE EXCEPTION ''Perfil somente de consulta de atendimentos.'' USING ERRCODE=''42501'';\nEND IF;\n';
BEGIN
 FOR f IN
  SELECT p.oid,p.proname,p.prosrc,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.prokind='f' AND l.lanname='plpgsql'
    AND p.prosecdef AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND p.proname <> 'attendance_can_access'
 LOOP
  IF position('atendimentos_viewer_entry_guard_v1' IN f.prosrc)>0 THEN CONTINUE; END IF;
  SELECT coalesce(string_agg(m[1],E'\n'),'') INTO directives
   FROM regexp_matches(f.prosrc,'(^[[:blank:]]*#[^\n]+)','gn') m;
  body:=regexp_replace(f.prosrc,'^[[:blank:]]*#[^\n]+\n?','','gn');
  body:=regexp_replace(body,';[[:space:]]*$','');
  body:=directives||E'\nBEGIN'||guard||E'\n'||body||E';\nEND;\n';
  EXECUTE replace(f.definition,f.prosrc,body);
 END LOOP;
END $migration$;
--> statement-breakpoint
-- Provisioning (service_role only). Never reads signup metadata.
CREATE OR REPLACE FUNCTION public.provision_atendimentos_viewer(_user_id uuid, _agencies text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a text;
BEGIN
  IF _user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'Usuário inexistente.' USING ERRCODE='22023';
  END IF;
  IF _agencies IS NULL OR cardinality(_agencies) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma imobiliária.' USING ERRCODE='22023';
  END IF;
  FOREACH a IN ARRAY _agencies LOOP
    IF a NOT IN ('cordial','morar') THEN
      RAISE EXCEPTION 'Imobiliária inválida: %', a USING ERRCODE='22023';
    END IF;
  END LOOP;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role::text <> 'atendimentos_viewer';
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'atendimentos_viewer'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_agencies WHERE user_id = _user_id;
  INSERT INTO public.user_agencies (user_id, agency)
    SELECT _user_id, x FROM (SELECT DISTINCT unnest(_agencies) x) s;
END $$;
REVOKE ALL ON FUNCTION public.provision_atendimentos_viewer(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_atendimentos_viewer(uuid, text[]) TO service_role;