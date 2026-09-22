-- Execute apenas em PostgreSQL isolado com todas as migrações aplicadas.
-- Exige PGOPTIONS='-c app.imobi_test_fixture=isolated'. A transação inteira
-- sofre ROLLBACK e nunca chama a API ou Storage externo.
BEGIN;
DO $test$
<<fixture>>
DECLARE
  fixture_id uuid;
  old_image_id uuid;
  staged_image_id uuid;
  publication_id uuid;
  job_id uuid;
  image_job_id uuid;
  media_job_id uuid;
  token uuid := gen_random_uuid();
  next_token uuid := gen_random_uuid();
  initial_gallery integer;
  after_stage integer;
  current_gallery integer;
  property_revision integer;
  reference text;
  result jsonb;
  owned boolean;
BEGIN
  IF current_setting('app.imobi_test_fixture', true) IS DISTINCT FROM 'isolated' THEN
    RAISE EXCEPTION 'Execute esta fixture somente no banco isolado';
  END IF;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  INSERT INTO public.properties (source, source_property_id, carteira)
  VALUES ('test_fixture', gen_random_uuid()::text, 'cordial') RETURNING id INTO fixture_id;
  reference := 'GC-' || left(upper(replace(fixture_id::text, '-', '')), 12);
  INSERT INTO public.property_provider_publications
    (property_id, provider, external_property_id, external_reference, status, enabled)
  VALUES (fixture_id, 'cordial', 'fixture-' || fixture_id::text, reference, 'published', true)
  RETURNING id INTO publication_id;

  INSERT INTO public.property_images
    (property_id, storage_path, original_storage_path, file_name, position, is_cover)
  VALUES (fixture_id, fixture_id::text || '/old.jpg', fixture_id::text || '/old.jpg',
          'old.jpg', 0, true)
  RETURNING id INTO old_image_id;
  SELECT gallery_revision INTO initial_gallery FROM public.properties WHERE id = fixture_id;

  SELECT public.property_image_stage_replacement(fixture_id, old_image_id,
    jsonb_build_object('storage_path', fixture_id::text || '/new.jpg',
                       'file_name', 'new.jpg', 'content_hash', 'new-hash'))
    INTO staged_image_id;
  SELECT gallery_revision INTO after_stage FROM public.properties WHERE id = fixture_id;
  IF after_stage <> initial_gallery THEN
    RAISE EXCEPTION 'Estágio invisível avançou a revisão da galeria';
  END IF;
  IF (SELECT count(*) FROM public.property_images
       WHERE property_id = fixture_id AND NOT coalesce(pending_remote_delete, false)) <> 1 THEN
    RAISE EXCEPTION 'Estágio tornou uma segunda foto visível';
  END IF;

  SELECT public.property_image_replace_atomic(fixture_id, old_image_id,
    staged_image_id, initial_gallery) INTO result;
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'Troca atômica não concluiu'; END IF;
  SELECT gallery_revision, revision INTO current_gallery, property_revision
    FROM public.properties WHERE id = fixture_id;
  IF current_gallery <= initial_gallery OR
     (SELECT count(*) FROM public.property_images
       WHERE property_id = fixture_id AND NOT coalesce(pending_remote_delete, false)) <> 1 OR
     NOT EXISTS (SELECT 1 FROM public.property_images
                  WHERE id = staged_image_id AND NOT coalesce(pending_remote_delete, false)) THEN
    RAISE EXCEPTION 'Troca não preservou a galeria ativa: revisão % -> %, ativas %, substituta ativa %',
      initial_gallery, current_gallery,
      (SELECT count(*) FROM public.property_images WHERE property_id = fixture_id
         AND NOT coalesce(pending_remote_delete, false)),
      (SELECT count(*) FROM public.property_images WHERE id = staged_image_id
         AND NOT coalesce(pending_remote_delete, false));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_provider_publications
                  WHERE id = publication_id AND media_dirty_revision >= current_gallery) THEN
    RAISE EXCEPTION 'Intenção de mídia não persistiu junto da galeria';
  END IF;

  INSERT INTO public.property_sync_jobs
    (property_id, provider, action, requested_revision, status, lease_token,
     lock_expires_at, publication_intent_revision)
  SELECT fixture_id, 'cordial', 'update', property_revision, 'processing', token,
         now() + interval '2 minutes', p.publication_intent_revision
    FROM public.property_provider_publications p WHERE p.id = publication_id
  RETURNING id INTO job_id;
  SELECT public.property_publication_update_if_owned(job_id, gen_random_uuid(),
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Token incorreto confirmou publicação'; END IF;
  SELECT public.property_publication_update_if_owned(job_id, token,
    publication_id, jsonb_build_object('confirmed_revision', property_revision)) INTO owned;
  IF NOT owned THEN RAISE EXCEPTION 'Token válido não confirmou publicação'; END IF;
  UPDATE public.property_sync_jobs SET lock_expires_at = now() - interval '1 second'
   WHERE id = job_id;
  SELECT public.property_publication_update_if_owned(job_id, token,
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned OR (SELECT confirmed_revision FROM public.property_provider_publications
               WHERE id = publication_id) <> property_revision THEN
    RAISE EXCEPTION 'Lease vencido avançou confirmação';
  END IF;

  -- Simula a reivindicação por outro worker. O retorno tardio do primeiro
  -- não pode ganhar posse nem avançar o checkpoint da publicação.
  UPDATE public.property_sync_jobs
     SET lease_token = next_token, lock_expires_at = now() + interval '2 minutes'
   WHERE id = job_id;
  SELECT public.property_publication_update_if_owned(job_id, token,
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Worker antigo confirmou após nova reivindicação'; END IF;
  SELECT public.property_publication_update_if_owned(job_id, next_token,
    publication_id, jsonb_build_object('confirmed_revision', property_revision)) INTO owned;
  IF NOT owned THEN RAISE EXCEPTION 'Worker novo não conseguiu confirmar'; END IF;

  -- O destino selecionado muda a marca desejada na transação local. Um
  -- processamento antigo não pode confirmar a derivada anterior.
  UPDATE public.property_images
     SET destination_hash = 'morar-cordial@v2', processing_status = 'ready',
         processed_storage_path = fixture_id::text || '/combined.jpg'
   WHERE id = staged_image_id;
  INSERT INTO public.property_image_jobs
    (image_id, property_id, watermark_variant, watermark_version,
     destination_hash, status, locked_by, lease_expires_at)
  VALUES (staged_image_id, fixture_id, 'morar-cordial', 'v2',
          'morar-cordial@v2', 'processing', 'old-image-worker', now() + interval '2 minutes')
  RETURNING id INTO image_job_id;
  UPDATE public.properties SET publish_targets = ARRAY['cordial'] WHERE id = fixture_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.property_images WHERE id = staged_image_id
      AND desired_destination_hash = 'cordial@v2' AND processing_status = 'pending'
  ) THEN RAISE EXCEPTION 'Troca de destino não persistiu variante pendente'; END IF;
  SELECT public.property_image_renew_lease(image_job_id, 'old-image-worker', 180) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Worker de marca antiga renovou o lease'; END IF;
  SELECT public.property_image_complete_job(image_job_id, 'old-image-worker',
    '{"processed_storage_path":"wrong.jpg"}'::jsonb) INTO owned;
  IF owned OR NOT EXISTS (
    SELECT 1 FROM public.property_image_jobs WHERE id = image_job_id AND status = 'cancelled'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.property_images WHERE id = staged_image_id
      AND destination_hash = 'morar-cordial@v2' AND processing_status = 'pending'
  ) THEN RAISE EXCEPTION 'Marca antiga confirmou após trocar o destino'; END IF;
  UPDATE public.property_images SET updated_at = now() - interval '3 minutes'
   WHERE id = staged_image_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.property_image_recovery_candidates(10)
     WHERE id = staged_image_id AND property_id = fixture_id
  ) THEN RAISE EXCEPTION 'Scanner não recuperou foto sem job da variante nova'; END IF;

  SELECT gallery_revision INTO current_gallery FROM public.properties WHERE id = fixture_id;
  INSERT INTO public.property_sync_jobs
    (property_id, provider, action, requested_revision, status, lease_token,
     lock_expires_at, publication_intent_revision)
  SELECT fixture_id, 'cordial', 'media_sync', current_gallery, 'processing', token,
         now() + interval '2 minutes', p.publication_intent_revision
    FROM public.property_provider_publications p WHERE p.id = publication_id
  RETURNING id INTO media_job_id;
  SELECT public.property_media_link_write_if_owned(media_job_id, next_token,
    publication_id, staged_image_id, '{"status":"synced"}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Token incorreto gravou vínculo de foto'; END IF;
  SELECT public.property_media_link_write_if_owned(media_job_id, token,
    publication_id, staged_image_id, '{"status":"synced"}'::jsonb) INTO owned;
  IF NOT owned OR NOT EXISTS (
    SELECT 1 FROM public.property_image_provider_publications l
     WHERE l.image_id = staged_image_id AND l.publication_id = fixture.publication_id
       AND l.status = 'synced'
  ) THEN RAISE EXCEPTION 'Token válido não gravou vínculo de foto'; END IF;
  UPDATE public.property_sync_jobs SET lock_expires_at = now() - interval '1 second'
   WHERE id = media_job_id;
  SELECT public.property_media_link_write_if_owned(media_job_id, token,
    publication_id, staged_image_id, '{"status":"deleted"}'::jsonb) INTO owned;
  IF owned OR NOT EXISTS (
    SELECT 1 FROM public.property_image_provider_publications l
     WHERE l.image_id = staged_image_id AND l.publication_id = fixture.publication_id
       AND l.status = 'synced'
  ) THEN RAISE EXCEPTION 'Lease vencido alterou confirmação da foto'; END IF;

  SELECT public.property_publication_request(fixture_id, ARRAY['cordial'],
    'unpublish', NULL, reference, NULL) INTO result;
  IF result->>'availability' <> 'hidden' OR NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications
     WHERE id = publication_id AND desired_availability = 'hidden' AND NOT enabled
  ) THEN RAISE EXCEPTION 'Ocultação não persistiu a decisão'; END IF;
  SELECT public.property_publication_update_if_owned(job_id, next_token,
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Job antigo confirmou após decisão de ocultar'; END IF;
END
$test$;
ROLLBACK;
