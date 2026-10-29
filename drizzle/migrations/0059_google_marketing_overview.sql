-- Sanitized, read-only Google overview. Daily rows are observations, not proof
-- of complete coverage or of the precision of the provider's original values.
CREATE OR REPLACE FUNCTION public.google_marketing_overview(
 p_agency text, p_account_id text, p_since date, p_until date,
 p_search text, p_status text, p_page integer, p_page_size integer, p_sort text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_result jsonb; v_financial boolean;
BEGIN
 IF public.is_meta_reviewer() OR NOT public.marketing_can_act('read_metrics',NULL)
    OR (p_agency IS NOT NULL AND NOT public.marketing_can_read(p_agency)) THEN
   RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501';
 END IF;
 IF (p_agency IS NOT NULL AND p_agency NOT IN ('cordial','morar'))
    OR (p_account_id IS NOT NULL AND p_account_id !~ '^[0-9]{10}$')
    OR p_since IS NULL OR p_until IS NULL OR p_until<p_since OR p_until-p_since>366
    OR coalesce(length(p_search),0)>100 OR coalesce(length(p_status),0)>40
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR p_sort IS NULL OR p_sort NOT IN ('name_asc','name_desc','status_asc','updated_desc','cost_desc','impressions_desc','clicks_desc','conversions_desc','ctr_desc','cpc_desc','cost_per_conversion_desc') THEN
   RAISE EXCEPTION 'Escopo inválido' USING ERRCODE='22023';
 END IF;
 v_financial:=public.marketing_can_act('financial_report',p_agency);
 IF p_sort IN ('cost_desc','impressions_desc','clicks_desc','conversions_desc','ctr_desc','cpc_desc','cost_per_conversion_desc') AND (p_agency IS NULL OR p_account_id IS NULL OR (p_sort IN ('cost_desc','cpc_desc','cost_per_conversion_desc') AND NOT v_financial)) THEN
   RAISE EXCEPTION 'Ordenação financeira requer permissão e conta específica' USING ERRCODE='42501';
 END IF;
 WITH filtered AS MATERIALIZED (
   SELECT c.id,c.nome,c.status,c.imobiliaria,c.external_account_id,c.last_synced_at,c.updated_at,
          a.currency,a.timezone
   FROM public.marketing_campaigns c
   JOIN public.ad_accounts a ON a.id=c.ad_account_id AND a.connection_id=c.connection_id
     AND a.platform='google' AND a.external_account_id=c.external_account_id
   JOIN public.ad_platform_connections con ON con.id=c.connection_id AND con.platform='google'
     AND con.imobiliaria=c.imobiliaria AND con.external_account_id=c.external_account_id
   WHERE c.platform='google' AND c.imobiliaria IN ('cordial','morar')
     AND public.marketing_can_read(c.imobiliaria)
     AND (p_agency IS NULL OR c.imobiliaria=p_agency)
     AND (p_account_id IS NULL OR c.external_account_id=p_account_id)
     AND (nullif(p_search,'') IS NULL OR c.nome ILIKE '%'||p_search||'%')
     AND (nullif(p_status,'') IS NULL OR c.status=p_status)
 ), observations AS MATERIALIZED (
   SELECT d.campaign_id,d.data,d.spend,d.impressions,d.clicks,d.conversions
   FROM public.marketing_daily_metrics d JOIN filtered f ON f.id=d.campaign_id
   WHERE d.metric_source='synced' AND d.data BETWEEN p_since AND p_until
 ), campaign_metrics AS (
   SELECT f.*,count(o.data) n,
     CASE WHEN count(o.data)>0 AND count(o.spend)=count(o.data) THEN sum(o.spend) END cost,
     CASE WHEN count(o.data)>0 AND count(o.impressions)=count(o.data) THEN sum(o.impressions) END impressions,
     CASE WHEN count(o.data)>0 AND count(o.clicks)=count(o.data) THEN sum(o.clicks::numeric) END clicks,
     CASE WHEN count(o.data)>0 AND count(o.conversions)=count(o.data) THEN sum(o.conversions) END conversions
   FROM filtered f LEFT JOIN observations o ON o.campaign_id=f.id
   GROUP BY f.id,f.nome,f.status,f.imobiliaria,f.external_account_id,f.last_synced_at,f.updated_at,f.currency,f.timezone
 ), paged AS (
   SELECT * FROM campaign_metrics
   ORDER BY CASE WHEN p_sort='name_asc' THEN lower(nome) END ASC,
            CASE WHEN p_sort='name_desc' THEN lower(nome) END DESC,
            CASE WHEN p_sort='status_asc' THEN lower(status) END ASC,
            CASE WHEN p_sort='updated_desc' THEN updated_at END DESC NULLS LAST,
            CASE WHEN p_sort='cost_desc' THEN cost END DESC NULLS LAST,
            CASE WHEN p_sort='impressions_desc' THEN impressions END DESC NULLS LAST,
            CASE WHEN p_sort='clicks_desc' THEN clicks END DESC NULLS LAST,
            CASE WHEN p_sort='conversions_desc' THEN conversions END DESC NULLS LAST,
            CASE WHEN p_sort='ctr_desc' AND impressions>0 THEN clicks/impressions END DESC NULLS LAST,
            CASE WHEN p_sort='cpc_desc' AND clicks>0 THEN cost/clicks END DESC NULLS LAST,
            CASE WHEN p_sort='cost_per_conversion_desc' AND conversions>0 THEN cost/conversions END DESC NULLS LAST,id
   LIMIT p_page_size OFFSET ((p_page-1)*p_page_size)
 ), consistency AS (
   SELECT count(*) n,
     CASE WHEN count(*)>0 AND count(currency)=count(*) AND count(DISTINCT currency)=1 THEN min(currency) END currency,
     CASE WHEN count(*)>0 AND count(timezone)=count(*) AND count(DISTINCT timezone)=1 THEN min(timezone) END timezone,
     CASE WHEN count(*)>0 AND count(DISTINCT (imobiliaria,external_account_id))=1 THEN true ELSE false END single_account,
     CASE WHEN count(*)>0 AND count(last_synced_at)=count(*) THEN min(last_synced_at) END last_collected_at
   FROM filtered
 ), totals AS (
   SELECT count(o.data) n,
     CASE WHEN count(o.data)>0 AND count(o.spend)=count(o.data) THEN sum(o.spend) END cost,
     CASE WHEN count(o.data)>0 AND count(o.impressions)=count(o.data) THEN sum(o.impressions) END impressions,
     CASE WHEN count(o.data)>0 AND count(o.clicks)=count(o.data) THEN sum(o.clicks::numeric) END clicks,
     CASE WHEN count(o.data)>0 AND count(o.conversions)=count(o.data) THEN sum(o.conversions) END conversions
   FROM observations o
 ), series AS (
   SELECT o.data,count(*) n,
     CASE WHEN count(o.spend)=count(*) THEN sum(o.spend) END cost,
     CASE WHEN count(o.impressions)=count(*) THEN sum(o.impressions) END impressions,
     CASE WHEN count(o.clicks)=count(*) THEN sum(o.clicks::numeric) END clicks,
     CASE WHEN count(o.conversions)=count(*) THEN sum(o.conversions) END conversions
   FROM observations o GROUP BY o.data
 )
 SELECT jsonb_build_object(
   'coverage',CASE WHEN t.n>0 THEN 'partial' ELSE 'unavailable' END,
   'currency',x.currency,'timezone',x.timezone,'lastCollectedAt',x.last_collected_at,
   'summary',jsonb_build_object(
     'cost',CASE WHEN v_financial AND x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL THEN t.cost::text END,
     'impressions',CASE WHEN x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL THEN t.impressions::text END,
     'clicks',CASE WHEN x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL THEN t.clicks::text END,
     'ctr',CASE WHEN x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL AND t.impressions>0 THEN (100*t.clicks/t.impressions)::text END,
     'cpc',CASE WHEN v_financial AND x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL AND t.clicks>0 THEN (t.cost/t.clicks)::text END,
     'conversions',CASE WHEN x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL THEN t.conversions::text END,
     'costPerConversion',CASE WHEN v_financial AND x.single_account AND x.currency IS NOT NULL AND x.timezone IS NOT NULL AND t.conversions>0 THEN (t.cost/t.conversions)::text END),
   'series',CASE WHEN NOT x.single_account OR x.currency IS NULL OR x.timezone IS NULL OR t.n=0 THEN NULL ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('date',s.data,'metrics',jsonb_build_object(
     'cost',CASE WHEN v_financial THEN s.cost::text END,'impressions',s.impressions::text,'clicks',s.clicks::text,'conversions',s.conversions::text,
     'ctr',CASE WHEN s.impressions>0 THEN (100*s.clicks/s.impressions)::text END,
     'cpc',CASE WHEN v_financial AND s.clicks>0 THEN (s.cost/s.clicks)::text END,
     'costPerConversion',CASE WHEN v_financial AND s.conversions>0 THEN (s.cost/s.conversions)::text END)) ORDER BY s.data) FROM series s),'[]'::jsonb) END,
   'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',p.id,'name',p.nome,'status',p.status,'nativeStatus',NULL,'channelType',NULL,'channelSubtype',NULL,
     'accountId',p.external_account_id,'agency',p.imobiliaria,'currency',p.currency,'timezone',p.timezone,'lastCollectedAt',p.last_synced_at,
     'coverage',CASE WHEN p.n>0 THEN 'partial' ELSE 'unavailable' END,
     'metrics',jsonb_build_object('cost',CASE WHEN v_financial AND p.currency IS NOT NULL AND p.timezone IS NOT NULL THEN p.cost::text END,
       'impressions',CASE WHEN p.currency IS NOT NULL AND p.timezone IS NOT NULL THEN p.impressions::text END,
       'clicks',CASE WHEN p.currency IS NOT NULL AND p.timezone IS NOT NULL THEN p.clicks::text END,
       'conversions',CASE WHEN p.currency IS NOT NULL AND p.timezone IS NOT NULL THEN p.conversions::text END,
       'ctr',CASE WHEN p.currency IS NOT NULL AND p.timezone IS NOT NULL AND p.impressions>0 THEN (100*p.clicks/p.impressions)::text END,
       'cpc',CASE WHEN v_financial AND p.currency IS NOT NULL AND p.timezone IS NOT NULL AND p.clicks>0 THEN (p.cost/p.clicks)::text END,
       'costPerConversion',CASE WHEN v_financial AND p.currency IS NOT NULL AND p.timezone IS NOT NULL AND p.conversions>0 THEN (p.cost/p.conversions)::text END),
     'dailySeries',CASE WHEN p.n=0 OR p.currency IS NULL OR p.timezone IS NULL THEN NULL ELSE
       (SELECT jsonb_agg(jsonb_build_object('date',o.data,'metrics',jsonb_build_object(
          'cost',CASE WHEN v_financial THEN o.spend::text END,
          'impressions',o.impressions::text,'clicks',o.clicks::text,'conversions',o.conversions::text,
          'ctr',CASE WHEN o.impressions>0 THEN (100*o.clicks::numeric/o.impressions)::text END,
          'cpc',CASE WHEN v_financial AND o.clicks>0 THEN (o.spend/o.clicks)::text END,
          'costPerConversion',CASE WHEN v_financial AND o.conversions>0 THEN (o.spend/o.conversions)::text END)) ORDER BY o.data)
        FROM observations o WHERE o.campaign_id=p.id) END)
     ORDER BY CASE WHEN p_sort='name_asc' THEN lower(p.nome) END ASC,
              CASE WHEN p_sort='name_desc' THEN lower(p.nome) END DESC,
              CASE WHEN p_sort='status_asc' THEN lower(p.status) END ASC,
              CASE WHEN p_sort='updated_desc' THEN p.updated_at END DESC NULLS LAST,
              CASE WHEN p_sort='cost_desc' THEN p.cost END DESC NULLS LAST,
              CASE WHEN p_sort='impressions_desc' THEN p.impressions END DESC NULLS LAST,
              CASE WHEN p_sort='clicks_desc' THEN p.clicks END DESC NULLS LAST,
              CASE WHEN p_sort='conversions_desc' THEN p.conversions END DESC NULLS LAST,
              CASE WHEN p_sort='ctr_desc' AND p.impressions>0 THEN p.clicks/p.impressions END DESC NULLS LAST,
              CASE WHEN p_sort='cpc_desc' AND p.clicks>0 THEN p.cost/p.clicks END DESC NULLS LAST,
              CASE WHEN p_sort='cost_per_conversion_desc' AND p.conversions>0 THEN p.cost/p.conversions END DESC NULLS LAST,p.id) FROM paged p),'[]'::jsonb),
   'total',x.n
 ) INTO v_result FROM consistency x CROSS JOIN totals t;
 RETURN v_result;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.google_marketing_overview(text,text,date,date,text,text,integer,integer,text) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.google_marketing_overview(text,text,date,date,text,text,integer,integer,text) TO authenticated,service_role;
