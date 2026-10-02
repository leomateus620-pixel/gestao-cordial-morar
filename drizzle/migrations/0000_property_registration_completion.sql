-- Aditivo: nenhuma linha existente é alterada.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS registration_completed_at timestamptz;

-- Drive: quando os códigos chegam depois, enfileira o job que renomeia a MESMA pasta pelo ID.
CREATE OR REPLACE FUNCTION public.property_drive_rename_on_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.codigo_cordial IS DISTINCT FROM OLD.codigo_cordial OR NEW.codigo_morar IS DISTINCT FROM OLD.codigo_morar)
     AND EXISTS (SELECT 1 FROM public.property_drive_folders f WHERE f.property_id = NEW.id AND f.property_folder_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.property_drive_jobs j WHERE j.property_id = NEW.id AND j.status IN ('pending','processing','retry')) THEN
    INSERT INTO public.property_drive_jobs (property_id) VALUES (NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.property_drive_rename_on_codes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS properties_drive_rename_on_codes ON public.properties;
CREATE TRIGGER properties_drive_rename_on_codes
  AFTER UPDATE OF codigo_cordial, codigo_morar ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.property_drive_rename_on_codes();

-- Lista de cadastros não concluídos (somente leitura).
CREATE OR REPLACE FUNCTION public.list_incomplete_registrations()
RETURNS TABLE(id uuid, codigo_cordial text, codigo_morar text, tipo text, bairro text, cidade text,
              created_at timestamptz, created_by uuid, criador_nome text, corretor_id uuid, corretor_nome text,
              is_draft boolean, has_publication boolean, has_agenciamento boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.codigo_cordial, p.codigo_morar, p.tipo, p.bairro, p.cidade, p.created_at, p.created_by,
         pf.nome, p.corretor_id, p.corretor_nome, COALESCE(p.is_draft, false),
         EXISTS (SELECT 1 FROM public.property_provider_publications x WHERE x.property_id = p.id AND x.enabled),
         EXISTS (SELECT 1 FROM public.agenciamentos a WHERE a.property_id = p.id)
    FROM public.properties p
    LEFT JOIN public.profiles pf ON pf.id = p.created_by
   WHERE p.source = 'gestao_cordial'
     AND p.archived_at IS NULL
     AND COALESCE(p.removal_state, '') NOT IN ('pending_archive', 'archived')
     AND (
       COALESCE(p.is_draft, false)
       OR NOT EXISTS (SELECT 1 FROM public.agenciamentos a WHERE a.property_id = p.id)
       OR (p.registration_completed_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.property_provider_publications x WHERE x.property_id = p.id AND x.enabled))
     )
     AND auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria')
          OR p.created_by = auth.uid() OR p.corretor_id = auth.uid())
   ORDER BY p.created_at DESC
   LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.list_incomplete_registrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_incomplete_registrations() TO authenticated, service_role;

-- Alertas: mantém o de criação travada e acrescenta cadastro não concluído (>30 min).
-- Só imóveis criados depois desta mudança, para não gerar avisos em massa de casos antigos.
CREATE OR REPLACE FUNCTION public.property_create_stuck_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _count integer := 0; _extra integer := 0;
BEGIN
  WITH stuck AS (
    SELECT p.id, p.property_id, p.provider::text AS provider, p.create_first_requested_at,
           pr.codigo::text AS codigo, pr.tipo::text AS tipo
      FROM public.property_provider_publications p
      JOIN public.properties pr ON pr.id = p.property_id
     WHERE p.external_property_id IS NULL
       AND p.enabled
       AND p.desired_availability = 'visible'
       AND p.create_first_requested_at IS NOT NULL
       AND p.create_first_requested_at < now() - interval '20 minutes'
       AND p.create_first_requested_at > now() - interval '7 days'
  ), admins AS (
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin'
  ), ins AS (
    INSERT INTO public.notifications
      (user_id, tipo, titulo, mensagem, link, lida, category, entity_type, entity_id, dedup_key, metadata)
    SELECT a.user_id, 'imobi_create_stuck',
           'Imóvel ainda não está no ar na ' || initcap(s.provider),
           COALESCE('Código ' || s.codigo || ' · ', '') || COALESCE(initcap(s.tipo), 'Imóvel') ||
             ' — pedido de criação há mais de 20 minutos sem confirmação do site.',
           '/imoveis/' || s.property_id, false, 'system', 'property', s.property_id,
           'imobi-create-stuck:' || s.id || ':' || extract(epoch from s.create_first_requested_at)::bigint || ':' || a.user_id,
           jsonb_build_object('provider', s.provider, 'publication_id', s.id)
      FROM stuck s CROSS JOIN admins a
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;

  WITH pend AS (
    SELECT p.id, p.created_by, p.tipo::text AS tipo,
           COALESCE(p.codigo_cordial, p.codigo_morar) AS codigo
      FROM public.properties p
     WHERE p.source = 'gestao_cordial'
       AND p.created_at > timestamptz '2026-10-02 15:30:00+00'
       AND p.created_at < now() - interval '30 minutes'
       AND p.created_at > now() - interval '14 days'
       AND p.archived_at IS NULL
       AND COALESCE(p.removal_state, '') NOT IN ('pending_archive', 'archived')
       AND (
         COALESCE(p.is_draft, false)
         OR NOT EXISTS (SELECT 1 FROM public.agenciamentos a WHERE a.property_id = p.id)
         OR (p.registration_completed_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM public.property_provider_publications x WHERE x.property_id = p.id AND x.enabled))
       )
  ), recipients AS (
    SELECT pe.id, pe.tipo, pe.codigo, r.user_id, false AS is_creator
      FROM pend pe CROSS JOIN (SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin') r
    UNION
    SELECT pe.id, pe.tipo, pe.codigo, pe.created_by, true
      FROM pend pe
     WHERE pe.created_by IS NOT NULL AND NOT public.has_role(pe.created_by, 'admin')
  ), ins2 AS (
    INSERT INTO public.notifications
      (user_id, tipo, titulo, mensagem, link, lida, category, entity_type, entity_id, dedup_key, metadata)
    SELECT rc.user_id, 'property_registration_incomplete',
           CASE WHEN rc.is_creator THEN 'Seu cadastro não foi concluído' ELSE 'Cadastro de imóvel não concluído' END,
           COALESCE('Código ' || rc.codigo || ' · ', '') || COALESCE(initcap(rc.tipo), 'Imóvel') ||
             ' — há mais de 30 minutos sem conclusão (publicação ou agenciamento pendente).',
           '/imoveis/' || rc.id, false, 'system', 'property', rc.id,
           'registration-incomplete:' || rc.id || ':' || rc.user_id,
           jsonb_build_object('property_id', rc.id)
      FROM recipients rc
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _extra FROM ins2;
  RETURN _count + _extra;
END $function$;