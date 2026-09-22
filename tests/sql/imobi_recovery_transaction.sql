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
  create_job_id uuid;
  availability_job_id uuid;
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

  -- O servidor pode chegar com uma lista de destinos vazia/obsoleta. A RPC
  -- deve descobrir a publicação habilitada sob a trava e gravar a outbox junto
  -- da revisão. Lista de campos vazia não significa envio completo.
  SELECT public.property_save_revision_enqueue_v2(
    fixture_id, 1, '{"bairro":"Centro"}'::jsonb, '{}'::text[],
    gen_random_uuid(), 'update', ARRAY['bairro']) INTO result;
  IF result->>'ok' <> 'true' OR result->'providers' <> '["cordial"]'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM public.property_sync_jobs WHERE property_id = fixture_id
         AND provider = 'cordial' AND action = 'update'
         AND requested_revision = (result->>'revision')::integer
         AND changed_fields = ARRAY['bairro']
     ) THEN RAISE EXCEPTION 'Edição não deixou intenção transacional para destino habilitado'; END IF;
  UPDATE public.property_sync_jobs SET status = 'succeeded'
   WHERE property_id = fixture_id AND provider = 'cordial' AND action = 'update';
  SELECT public.property_save_revision_enqueue_v2(
    fixture_id, (result->>'revision')::integer, '{"bairro":"Centro"}'::jsonb,
    '{}'::text[], gen_random_uuid(), 'update', '{}'::text[]) INTO result;
  IF result->'providers' <> '[]'::jsonb OR EXISTS (
    SELECT 1 FROM public.property_sync_jobs WHERE property_id = fixture_id
      AND provider = 'cordial' AND action = 'update'
      AND requested_revision = (result->>'revision')::integer
  ) THEN RAISE EXCEPTION 'Lista vazia de campos virou envio completo'; END IF;

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
  UPDATE public.properties SET revision = revision + 1 WHERE id = fixture_id;
  SELECT public.property_publication_update_if_owned(job_id, next_token,
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Edição concorrente aceitou confirmação cadastral antiga'; END IF;

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

  -- O checkpoint de criação precede o POST e exige token da reivindicação,
  -- intenção atual e revisão cadastral exata. Um worker atrasado não prepara
  -- uma segunda criação após outra edição local.
  SELECT revision INTO property_revision FROM public.properties WHERE id = fixture_id;
  UPDATE public.property_provider_publications
     SET external_property_id = NULL, create_lock_worker = token::text,
         create_lock_expires_at = now() + interval '2 minutes'
   WHERE id = publication_id;
  INSERT INTO public.property_sync_jobs
    (property_id, provider, action, requested_revision, status, lease_token,
     lock_expires_at, publication_intent_revision)
  SELECT fixture_id, 'cordial', 'publish', property_revision, 'processing', token,
         now() + interval '2 minutes', p.publication_intent_revision
    FROM public.property_provider_publications p WHERE p.id = publication_id
  RETURNING id INTO create_job_id;
  SELECT public.property_publication_prepare_create(create_job_id, next_token,
    publication_id, next_token::text) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Token incorreto preparou criação'; END IF;
  SELECT public.property_publication_prepare_create(create_job_id, token,
    publication_id, token::text) INTO owned;
  IF NOT owned OR NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications WHERE id = publication_id
      AND create_state = 'awaiting_create_reconcile'
  ) THEN RAISE EXCEPTION 'Criação sem intenção anterior ao POST'; END IF;
  UPDATE public.properties SET revision = revision + 1 WHERE id = fixture_id;
  SELECT public.property_publication_prepare_create(create_job_id, token,
    publication_id, token::text) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Criação antiga passou após edição nova'; END IF;

  SELECT public.property_publication_request(fixture_id, ARRAY['cordial'],
    'unpublish', NULL, reference, NULL) INTO result;
  IF result->>'availability' <> 'hidden' OR NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications
     WHERE id = publication_id AND desired_availability = 'hidden' AND NOT enabled
  ) THEN RAISE EXCEPTION 'Ocultação não persistiu a decisão'; END IF;
  SELECT public.property_publication_update_if_owned(job_id, next_token,
    publication_id, '{"confirmed_revision": 999}'::jsonb) INTO owned;
  IF owned THEN RAISE EXCEPTION 'Job antigo confirmou após decisão de ocultar'; END IF;

  SELECT id INTO availability_job_id FROM public.property_sync_jobs
   WHERE property_id = fixture_id AND provider = 'cordial' AND action = 'unpublish'
   ORDER BY created_at DESC LIMIT 1;
  UPDATE public.property_sync_jobs
     SET status = 'processing', lease_token = token,
         lock_expires_at = now() + interval '2 minutes'
   WHERE id = availability_job_id;
  SELECT public.property_publication_finish_availability_if_owned(
    availability_job_id, next_token, publication_id, 'unpublish') INTO owned;
  IF owned THEN RAISE EXCEPTION 'Token errado ocultou publicação'; END IF;
  SELECT public.property_publication_finish_availability_if_owned(
    availability_job_id, token, publication_id, 'unpublish') INTO owned;
  IF NOT owned OR NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications WHERE id = publication_id
      AND status = 'unpublished' AND NOT enabled
  ) THEN RAISE EXCEPTION 'Ocultação válida não foi confirmada'; END IF;
  SELECT public.property_publication_request(fixture_id, ARRAY['cordial'],
    'publish', NULL, reference, NULL) INTO result;
  SELECT public.property_publication_finish_availability_if_owned(
    availability_job_id, token, publication_id, 'unpublish') INTO owned;
  IF owned OR NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications WHERE id = publication_id
      AND desired_availability = 'visible' AND enabled
  ) THEN RAISE EXCEPTION 'Worker de ocultação desfez nova publicação'; END IF;

  SELECT revision INTO property_revision FROM public.properties WHERE id = fixture_id;
  SELECT public.property_retire_request(fixture_id, gen_random_uuid(),
    'delete', property_revision) INTO result;
  IF result->>'ok' <> 'true' OR result->'providers' <> '["cordial"]'::jsonb
     OR NOT EXISTS (
       SELECT 1 FROM public.properties WHERE id = fixture_id
         AND removal_state = 'pending_removal' AND revision = property_revision + 1
     ) OR NOT EXISTS (
       SELECT 1 FROM public.property_sync_jobs WHERE property_id = fixture_id
         AND provider = 'cordial' AND action = 'delete'
         AND publication_intent_revision = (
           SELECT publication_intent_revision FROM public.property_provider_publications
            WHERE id = publication_id)
  ) THEN RAISE EXCEPTION 'Exclusão não persistiu decisão e job na mesma transação'; END IF;

  SELECT public.property_import_seed_incremental('cordial') INTO result;
  IF result->>'started' <> 'true' OR NOT EXISTS (
    SELECT 1 FROM public.property_import_jobs j
    JOIN public.property_import_runs r ON r.id = j.run_id
    WHERE r.provider = 'cordial' AND r.mode = 'incremental'
      AND j.job_type = 'fetch_page' AND j.page = 1
  ) THEN RAISE EXCEPTION 'Importação incremental não iniciou o cursor'; END IF;
  SELECT public.property_import_seed_incremental('cordial') INTO result;
  IF result->>'reason' <> 'active_run' THEN
    RAISE EXCEPTION 'Cron duplicado iniciou outra importação da mesma conta';
  END IF;
  SELECT public.property_import_seed_incremental('morar') INTO result;
  IF result->>'started' <> 'true' THEN
    RAISE EXCEPTION 'Importação Cordial bloqueou a conta Morar';
  END IF;
END
$test$;
ROLLBACK;
