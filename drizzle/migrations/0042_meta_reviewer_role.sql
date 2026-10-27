ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'meta_reviewer';

CREATE OR REPLACE FUNCTION public.is_meta_reviewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'meta_reviewer')
$$;
REVOKE ALL ON FUNCTION public.is_meta_reviewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meta_reviewer() TO authenticated, service_role;

-- Meta reviewer is blocked from every application table except marketing ones.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND c.relname NOT IN ('marketing_campaigns','marketing_daily_metrics','ad_accounts','ad_sync_jobs','profiles','user_roles','user_agencies')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS meta_reviewer_block ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer())', t.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.marketing_can_operate(p_agency text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.is_meta_reviewer() OR (public.has_role(auth.uid(),'secretaria') AND NOT public.has_role(auth.uid(),'financeiro') AND public.has_notification_agency_access(auth.uid(),p_agency)))
$function$;

DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.marketing_campaigns_safe'::regproc);
  IF position('is_meta_reviewer' in def) = 0 THEN
    def := replace(def, 'NOT (financial OR(public.has_role(auth.uid(),''secretaria'')', 'NOT (financial OR public.is_meta_reviewer() OR(public.has_role(auth.uid(),''secretaria'')');
    IF position('is_meta_reviewer' in def) = 0 THEN RAISE EXCEPTION 'marketing_campaigns_safe access check not found'; END IF;
    EXECUTE def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ad_connections_public()
 RETURNS TABLE(id uuid, user_id uuid, imobiliaria text, platform text, account_label text, expires_at timestamp with time zone, scopes text, status text, last_error text, updated_at timestamp with time zone, credential_mode text, app_id text, page_id text, external_account_id text, capabilities jsonb, last_diagnosed_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT c.id,c.user_id,c.imobiliaria,c.platform,c.account_label,c.expires_at,c.scopes,c.status,
 CASE WHEN c.last_error IS NULL THEN NULL ELSE 'Falha na conexão. Execute o diagnóstico.' END,c.updated_at,c.credential_mode,c.app_id,c.page_id,c.external_account_id,c.capabilities,c.last_diagnosed_at
 FROM public.ad_platform_connections c WHERE public.has_role(auth.uid(),'admin') OR public.is_meta_reviewer()
$function$;