-- Diagnóstico somente leitura. Uma linha por conta evita alertas repetidos por
-- imóvel; as condições desaparecem da vista assim que a fila se recupera.
CREATE OR REPLACE VIEW public.property_integration_health AS
SELECT account.provider,
       circuit.blocked_until,
       circuit.last_auth_status,
       circuit.last_auth_error_at,
       circuit.last_success_at,
       (SELECT max(EXTRACT(EPOCH FROM (now() - j.created_at)) / 60)::integer
          FROM public.property_sync_jobs j
         WHERE j.provider = account.provider
           AND j.status IN ('pending', 'retry', 'processing')) AS oldest_open_minutes,
       (SELECT count(*)::integer FROM public.property_sync_jobs j
         WHERE j.provider = account.provider AND j.status = 'processing'
           AND j.lock_expires_at < now()) AS expired_leases,
       (SELECT count(*)::integer FROM public.property_sync_jobs j
         WHERE j.provider = account.provider AND j.status IN ('pending','retry','processing')) AS open_jobs,
       (SELECT count(*)::integer FROM public.property_sync_jobs j
         WHERE j.provider = account.provider
           AND j.last_error_category IN ('delivery_unknown','ambiguous')) AS ambiguous_jobs,
       (SELECT count(*)::integer FROM public.property_provider_publications p
         WHERE p.provider = account.provider
           AND (p.conflict_count > 0 OR p.status = 'out_of_sync')) AS divergent_publications,
       (SELECT count(*)::integer FROM public.property_provider_publications p
         WHERE p.provider = account.provider AND p.enabled
           AND p.desired_availability = 'visible'
           AND p.external_property_id IS NOT NULL
           AND GREATEST(COALESCE(p.media_dirty_revision, 0),
                        COALESCE((SELECT x.gallery_revision FROM public.properties x
                                  WHERE x.id = p.property_id), 0))
               > COALESCE(p.synced_gallery_revision, 0)) AS media_behind
  FROM (VALUES ('cordial'::public.imobi_provider),
               ('morar'::public.imobi_provider)) AS account(provider)
  LEFT JOIN public.property_provider_recovery_circuit circuit
    ON circuit.provider = account.provider;

REVOKE ALL ON public.property_integration_health FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.property_integration_health TO service_role;
