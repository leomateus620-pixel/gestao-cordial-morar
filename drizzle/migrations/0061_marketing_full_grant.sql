ALTER TABLE public.marketing_action_grants DROP CONSTRAINT IF EXISTS marketing_action_grants_action_check;
ALTER TABLE public.marketing_action_grants ADD CONSTRAINT marketing_action_grants_action_check
 CHECK(action IN ('read_ad_budget','create_draft','send_paused','change_budget','set_delivery','marketing_full'));

CREATE OR REPLACE FUNCTION public.marketing_actor_can_act(p_actor uuid,p_action text,p_agency text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_actor IS NOT NULL
 AND p_action=ANY(ARRAY['read_metrics','read_ad_budget','read_lead_contacts','manage_leads','create_draft','send_paused','change_budget','set_delivery','generate_report','financial_report','manage_connection','manage_manual'])
 AND (p_agency IS NULL OR p_agency=ANY(ARRAY['cordial','morar']))
 AND CASE WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text='meta_reviewer')
 THEN p_action='read_metrics' AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))
 ELSE public.has_role(p_actor,'admin') OR (
   public.has_role(p_actor,'secretaria') AND NOT public.has_role(p_actor,'financeiro')
   AND (p_action=ANY(ARRAY['read_metrics','read_lead_contacts','manage_leads','create_draft','generate_report','manage_manual'])
     OR EXISTS(SELECT 1 FROM public.marketing_action_grants g WHERE g.user_id=p_actor AND g.action=p_action
       AND (p_agency IS NULL OR g.imobiliaria=p_agency) AND public.has_notification_agency_access(p_actor,g.imobiliaria))
     OR (p_action<>'manage_connection' AND EXISTS(SELECT 1 FROM public.marketing_action_grants g WHERE g.user_id=p_actor AND g.action='marketing_full'
       AND (p_agency IS NULL OR g.imobiliaria=p_agency) AND public.has_notification_agency_access(p_actor,g.imobiliaria))))
   AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))) END
$$;

INSERT INTO public.marketing_action_grants(user_id,imobiliaria,action,reason)
SELECT 'b06a522f-65b4-4e2a-8bb4-e9e1f0675b75'::uuid,a.agency,'marketing_full','Explicit user authorization (Leonardo, 2026-10-30): Bianca has full Marketing access (Meta, Google, reports incl. financial, current and future actions); connection administration stays admin-only.'
FROM unnest(ARRAY['cordial','morar']) a(agency)
ON CONFLICT DO NOTHING;