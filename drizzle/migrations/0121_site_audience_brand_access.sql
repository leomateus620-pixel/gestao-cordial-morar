-- Share one permission rule between the brand picker and each aggregate read.
CREATE FUNCTION site_audience.allowed_brands(p_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT ARRAY(
    SELECT brand FROM unnest(ARRAY['cordial', 'morar']) AS brands(brand)
    WHERE public.has_role(p_user_id, 'admin')
       OR (NOT public.has_role(p_user_id, 'financeiro')
           AND (public.has_role(p_user_id, 'secretaria') OR public.has_role(p_user_id, 'corretor'))
           AND public.has_notification_agency_access(p_user_id, brand))
    ORDER BY brand
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION site_audience.allowed_brands(uuid) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION public.site_audience_allowed_brands()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT site_audience.allowed_brands(auth.uid())
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.site_audience_allowed_brands() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.site_audience_allowed_brands() TO authenticated;
--> statement-breakpoint
-- The server supplies the verified session user and resolves the environment and policy.
CREATE FUNCTION public.site_audience_report_for_user(
  p_user_id uuid, p_brand text, p_environment text, p_period text, p_offset int, p_view text, p_policy_version text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_brand = ANY (site_audience.allowed_brands(p_user_id))
    THEN public.site_audience_report(p_brand, p_environment, p_period, p_offset, p_view, p_policy_version)
    ELSE jsonb_build_object('status', 'unauthorized') END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.site_audience_report_for_user(uuid,text,text,text,int,text,text) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.site_audience_report_for_user(uuid,text,text,text,int,text,text) TO service_role;
