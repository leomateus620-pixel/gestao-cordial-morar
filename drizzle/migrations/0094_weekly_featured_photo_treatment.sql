-- Isolated, pre-authorized photometric treatment of the five weekly highlights.
-- Existing generative hero approval and property originals remain unchanged.
ALTER TABLE public.cordial_site_showcase_settings ADD COLUMN featured_policy jsonb;

CREATE TABLE public.cordial_site_featured_weeks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','ready','active','ended','failed','superseded')),
 expected_items int NOT NULL CHECK(expected_items BETWEEN 1 AND 5),
 approved_at timestamptz NOT NULL, approved_by uuid, approval_basis jsonb NOT NULL,
 active_from timestamptz, active_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cordial_featured_current_week ON public.cordial_site_featured_weeks(week_start) WHERE state <> 'superseded';
CREATE UNIQUE INDEX cordial_featured_one_active ON public.cordial_site_featured_weeks((true)) WHERE state = 'active';
CREATE TABLE public.cordial_site_featured_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_id uuid NOT NULL REFERENCES public.cordial_site_featured_weeks(id),
 slot int NOT NULL CHECK(slot BETWEEN 1 AND 5), public_id uuid NOT NULL, property_id uuid NOT NULL,
 expected_photos int NOT NULL CHECK(expected_photos BETWEEN 1 AND 3),
 UNIQUE(week_id,slot), UNIQUE(week_id,public_id)
);
CREATE TABLE public.cordial_site_featured_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.cordial_site_featured_items(id),
 ordinal int NOT NULL CHECK(ordinal BETWEEN 0 AND 2), media_id uuid NOT NULL,
 media_version text NOT NULL CHECK(media_version ~ '^[a-f0-9]{32}$'), source_position int NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','ready','failed','uncertain','invalid')),
 parameters jsonb, variants jsonb NOT NULL DEFAULT '{}'::jsonb, model text, treatment_version text, checksum text CHECK(checksum ~ '^[a-f0-9]{64}$'),
 storage_prefix text CHECK(storage_prefix ~ '^featured/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}$'),
 width int CHECK(width>0), height int CHECK(height>0), attempts int NOT NULL DEFAULT 0,
 lease uuid, lease_until timestamptz, error text, prepared_at timestamptz,
 UNIQUE(item_id,ordinal), UNIQUE(item_id,media_id),
 CHECK(state <> 'ready' OR (checksum IS NOT NULL AND storage_prefix IS NOT NULL AND parameters IS NOT NULL AND prepared_at IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND variants ?& ARRAY['thumb','card','full']))
);
CREATE INDEX cordial_featured_media_lookup ON public.cordial_site_featured_photos(media_id,media_version,checksum) WHERE state='ready';
CREATE TABLE public.cordial_site_featured_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 week_id uuid REFERENCES public.cordial_site_featured_weeks(id), photo_id uuid REFERENCES public.cordial_site_featured_photos(id),
 kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['cordial_site_featured_weeks','cordial_site_featured_items','cordial_site_featured_photos','cordial_site_featured_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY featured_admin_read ON public.%I FOR SELECT TO authenticated USING(public.has_role(auth.uid(),''admin''))',t);
  EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.has_role(auth.uid(),''meta_reviewer'')) WITH CHECK(NOT public.has_role(auth.uid(),''meta_reviewer''))',t);
  EXECUTE format('CREATE POLICY atendimentos_viewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.has_role(auth.uid(),''atendimentos_viewer'')) WITH CHECK(NOT public.has_role(auth.uid(),''atendimentos_viewer''))',t);
 END LOOP;
END $$;

GRANT USAGE,SELECT ON SEQUENCE public.cordial_site_featured_events_id_seq TO service_role;

CREATE FUNCTION public.cordial_site_featured_plan(_week date,_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE policy jsonb; batch uuid; item jsonb; photo jsonb; item_id uuid; source_property uuid; photo_count int; expected_ids jsonb; supplied_ids jsonb; slot_index int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('cordial_site_featured_plan'));
 SELECT featured_policy INTO policy FROM public.cordial_site_showcase_settings WHERE id;
 IF policy IS NULL OR policy->>'enabled' IS DISTINCT FROM 'true' OR policy->>'treatment' IS DISTINCT FROM 'faithful-tone-v1'
    OR nullif(policy->>'authorizedAt','') IS NULL OR length(coalesce(policy->>'authorization',''))<10 THEN
   RAISE EXCEPTION 'Featured treatment has not been authorized';
 END IF;
 IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid featured selection'; END IF;
 SELECT id INTO batch FROM public.cordial_site_featured_weeks WHERE week_start=_week AND state<>'superseded';
 IF FOUND THEN RETURN batch; END IF;
 INSERT INTO public.cordial_site_featured_weeks(week_start,expected_items,approved_at,approved_by,approval_basis)
 VALUES(_week,jsonb_array_length(_items),(policy->>'authorizedAt')::timestamptz,nullif(policy->>'authorizedBy','')::uuid,policy) RETURNING id INTO batch;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
   slot_index:=slot_index+1;
   IF (item->>'slot')::int IS DISTINCT FROM slot_index THEN RAISE EXCEPTION 'Invalid slot order'; END IF;
   SELECT property_id INTO source_property FROM public.cordial_site_eligible WHERE public_id=(item->>'publicId')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Featured property is no longer published'; END IF;
   photo_count := jsonb_array_length(item->'photos');
   IF photo_count NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid photo selection'; END IF;
   SELECT jsonb_agg(x.id ORDER BY x.rank,x.position,x.id) INTO expected_ids FROM (
     SELECT m.id,m.position,CASE WHEN m.id::text=d.document->'cover'->>'id' THEN 0 ELSE 1 END rank
     FROM public.cordial_site_authorized_media m JOIN public.cordial_site_documents d ON d.public_id=m.public_id
     WHERE m.public_id=(item->>'publicId')::uuid ORDER BY rank,m.position,m.id LIMIT 3
   ) x;
   SELECT jsonb_agg(p->>'id' ORDER BY (p->>'ordinal')::int) INTO supplied_ids FROM jsonb_array_elements(item->'photos') p;
   IF expected_ids IS DISTINCT FROM supplied_ids OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(item->'photos') WITH ORDINALITY p(value,n) WHERE (value->>'ordinal')::int IS DISTINCT FROM n-1)
   THEN RAISE EXCEPTION 'Only the current cover and first photos can be treated'; END IF;
   INSERT INTO public.cordial_site_featured_items(week_id,slot,public_id,property_id,expected_photos)
   VALUES(batch,(item->>'slot')::int,(item->>'publicId')::uuid,source_property,photo_count) RETURNING id INTO item_id;
   FOR photo IN SELECT value FROM jsonb_array_elements(item->'photos') LOOP
     IF NOT EXISTS(SELECT 1 FROM public.cordial_site_authorized_media m WHERE m.id=(photo->>'id')::uuid
       AND m.version=photo->>'version' AND m.public_id=(item->>'publicId')::uuid AND m.position=(photo->>'position')::int) THEN
       RAISE EXCEPTION 'Featured photo is no longer authorized';
     END IF;
     INSERT INTO public.cordial_site_featured_photos(item_id,ordinal,media_id,media_version,source_position)
     VALUES(item_id,(photo->>'ordinal')::int,(photo->>'id')::uuid,photo->>'version',(photo->>'position')::int);
   END LOOP;
 END LOOP;
 INSERT INTO public.cordial_site_featured_events(week_id,kind,detail) VALUES(batch,'planned',jsonb_build_object('items',jsonb_array_length(_items),'treatment','faithful-tone-v1'));
 RETURN batch;
END $$;

CREATE FUNCTION public.cordial_site_featured_claim(_week uuid,_lease uuid)
RETURNS SETOF public.cordial_site_featured_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE photo uuid;
BEGIN
 SELECT p.id INTO photo FROM public.cordial_site_featured_photos p
 JOIN public.cordial_site_featured_items i ON i.id=p.item_id
 JOIN public.cordial_site_featured_weeks w ON w.id=i.week_id
 WHERE w.id=_week AND w.state='preparing' AND p.state='queued' AND p.attempts<3
 ORDER BY p.ordinal,i.slot FOR UPDATE OF p SKIP LOCKED LIMIT 1;
 IF photo IS NULL THEN RETURN; END IF;
 INSERT INTO public.cordial_site_featured_events(week_id,photo_id,kind) VALUES(_week,photo,'processing');
 RETURN QUERY UPDATE public.cordial_site_featured_photos SET state='processing',lease=_lease,
 lease_until=now()+interval '5 minutes', attempts=attempts+1,error=NULL WHERE id=photo RETURNING *;
END $$;

CREATE VIEW public.cordial_site_featured_authorized_photos WITH(security_invoker=true) AS
SELECT p.id AS photo_id,p.media_id,p.media_version,p.source_position,p.ordinal,p.checksum,p.storage_prefix,p.width,p.height,p.variants,
 i.public_id,i.slot,i.week_id
FROM public.cordial_site_featured_photos p
JOIN public.cordial_site_featured_items i ON i.id=p.item_id
JOIN public.cordial_site_featured_weeks w ON w.id=i.week_id
JOIN public.cordial_site_authorized_media m ON m.id=p.media_id AND m.version=p.media_version
 AND m.public_id=i.public_id AND m.position=p.source_position
WHERE w.state='active' AND w.approved_at IS NOT NULL AND p.state='ready' AND p.treatment_version='faithful-tone-v1';
REVOKE ALL ON public.cordial_site_featured_authorized_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_featured_authorized_photos TO service_role;

CREATE FUNCTION public.cordial_site_featured_activate(_week uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch public.cordial_site_featured_weeks; n int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('cordial_site_featured_activate'));
 SELECT * INTO batch FROM public.cordial_site_featured_weeks WHERE id=_week FOR UPDATE;
 IF NOT FOUND OR batch.state NOT IN ('preparing','ready','active') OR batch.approved_at IS NULL THEN RETURN false; END IF;
 IF batch.state='active' THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.cordial_site_featured_weeks WHERE state='active' AND week_start>batch.week_start) THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.cordial_site_featured_items WHERE week_id=_week;
 IF n<>batch.expected_items THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.cordial_site_featured_items i WHERE i.week_id=_week AND
   (SELECT count(*) FROM public.cordial_site_featured_photos p WHERE p.item_id=i.id AND p.state='ready' AND p.treatment_version='faithful-tone-v1')<>i.expected_photos) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.cordial_site_featured_photos p JOIN public.cordial_site_featured_items i ON i.id=p.item_id
   WHERE i.week_id=_week AND NOT EXISTS(SELECT 1 FROM public.cordial_site_authorized_media m
    WHERE m.id=p.media_id AND m.version=p.media_version AND m.public_id=i.public_id AND m.position=p.source_position)) THEN RETURN false; END IF;
 -- Complete weeks only; the previous active set remains visible while preparation runs.
 UPDATE public.cordial_site_featured_weeks SET state='ended',active_until=now() WHERE state='active' AND id<>_week;
 UPDATE public.cordial_site_featured_weeks SET state='active',active_from=coalesce(active_from,now()),active_until=NULL WHERE id=_week;
 INSERT INTO public.cordial_site_featured_events(week_id,kind) VALUES(_week,'activated');
 RETURN true;
END $$;

CREATE FUNCTION public.cordial_site_featured_active()
RETURNS TABLE(slot int,public_id uuid,media_id uuid,media_version text,checksum text,ordinal int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH active AS MATERIALIZED(SELECT id FROM public.cordial_site_featured_weeks WHERE state='active' AND approved_at IS NOT NULL LIMIT 1)
 SELECT i.slot,i.public_id,p.media_id,p.media_version,p.checksum,p.ordinal FROM active w
 JOIN public.cordial_site_featured_items i ON i.week_id=w.id
 JOIN public.cordial_site_featured_photos p ON p.item_id=i.id AND p.state='ready' AND p.treatment_version='faithful-tone-v1'
 CROSS JOIN LATERAL(SELECT 1 FROM public.cordial_site_authorized_media m WHERE m.id=p.media_id
  AND m.version=p.media_version AND m.public_id=i.public_id AND m.position=p.source_position LIMIT 1) valid
 ORDER BY i.slot,p.ordinal
$$;
REVOKE ALL ON FUNCTION public.cordial_site_featured_plan(date,jsonb),public.cordial_site_featured_claim(uuid,uuid),public.cordial_site_featured_activate(uuid),public.cordial_site_featured_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_featured_plan(date,jsonb),public.cordial_site_featured_claim(uuid,uuid),public.cordial_site_featured_activate(uuid),public.cordial_site_featured_active() TO service_role;

--> statement-breakpoint
ALTER TABLE public.morar_site_showcase_settings ADD COLUMN featured_policy jsonb;

CREATE TABLE public.morar_site_featured_weeks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','ready','active','ended','failed','superseded')),
 expected_items int NOT NULL CHECK(expected_items BETWEEN 1 AND 5),
 approved_at timestamptz NOT NULL, approved_by uuid, approval_basis jsonb NOT NULL,
 active_from timestamptz, active_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX morar_featured_current_week ON public.morar_site_featured_weeks(week_start) WHERE state <> 'superseded';
CREATE UNIQUE INDEX morar_featured_one_active ON public.morar_site_featured_weeks((true)) WHERE state = 'active';
CREATE TABLE public.morar_site_featured_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_id uuid NOT NULL REFERENCES public.morar_site_featured_weeks(id),
 slot int NOT NULL CHECK(slot BETWEEN 1 AND 5), public_id uuid NOT NULL, property_id uuid NOT NULL,
 expected_photos int NOT NULL CHECK(expected_photos BETWEEN 1 AND 3),
 UNIQUE(week_id,slot), UNIQUE(week_id,public_id)
);
CREATE TABLE public.morar_site_featured_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.morar_site_featured_items(id),
 ordinal int NOT NULL CHECK(ordinal BETWEEN 0 AND 2), media_id uuid NOT NULL,
 media_version text NOT NULL CHECK(media_version ~ '^[a-f0-9]{32}$'), source_position int NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','ready','failed','uncertain','invalid')),
 parameters jsonb, variants jsonb NOT NULL DEFAULT '{}'::jsonb, model text, treatment_version text, checksum text CHECK(checksum ~ '^[a-f0-9]{64}$'),
 storage_prefix text CHECK(storage_prefix ~ '^featured/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}$'),
 width int CHECK(width>0), height int CHECK(height>0), attempts int NOT NULL DEFAULT 0,
 lease uuid, lease_until timestamptz, error text, prepared_at timestamptz,
 UNIQUE(item_id,ordinal), UNIQUE(item_id,media_id),
 CHECK(state <> 'ready' OR (checksum IS NOT NULL AND storage_prefix IS NOT NULL AND parameters IS NOT NULL AND prepared_at IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND variants ?& ARRAY['thumb','card','full']))
);
CREATE INDEX morar_featured_media_lookup ON public.morar_site_featured_photos(media_id,media_version,checksum) WHERE state='ready';
CREATE TABLE public.morar_site_featured_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 week_id uuid REFERENCES public.morar_site_featured_weeks(id), photo_id uuid REFERENCES public.morar_site_featured_photos(id),
 kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['morar_site_featured_weeks','morar_site_featured_items','morar_site_featured_photos','morar_site_featured_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY featured_admin_read ON public.%I FOR SELECT TO authenticated USING(public.has_role(auth.uid(),''admin''))',t);
  EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.has_role(auth.uid(),''meta_reviewer'')) WITH CHECK(NOT public.has_role(auth.uid(),''meta_reviewer''))',t);
  EXECUTE format('CREATE POLICY atendimentos_viewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.has_role(auth.uid(),''atendimentos_viewer'')) WITH CHECK(NOT public.has_role(auth.uid(),''atendimentos_viewer''))',t);
 END LOOP;
END $$;

GRANT USAGE,SELECT ON SEQUENCE public.morar_site_featured_events_id_seq TO service_role;

CREATE FUNCTION public.morar_site_featured_plan(_week date,_items jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE policy jsonb; batch uuid; item jsonb; photo jsonb; item_id uuid; source_property uuid; photo_count int; expected_ids jsonb; supplied_ids jsonb; slot_index int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('morar_site_featured_plan'));
 SELECT featured_policy INTO policy FROM public.morar_site_showcase_settings WHERE id;
 IF policy IS NULL OR policy->>'enabled' IS DISTINCT FROM 'true' OR policy->>'treatment' IS DISTINCT FROM 'faithful-tone-v1'
    OR nullif(policy->>'authorizedAt','') IS NULL OR length(coalesce(policy->>'authorization',''))<10 THEN
   RAISE EXCEPTION 'Featured treatment has not been authorized';
 END IF;
 IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid featured selection'; END IF;
 SELECT id INTO batch FROM public.morar_site_featured_weeks WHERE week_start=_week AND state<>'superseded';
 IF FOUND THEN RETURN batch; END IF;
 INSERT INTO public.morar_site_featured_weeks(week_start,expected_items,approved_at,approved_by,approval_basis)
 VALUES(_week,jsonb_array_length(_items),(policy->>'authorizedAt')::timestamptz,nullif(policy->>'authorizedBy','')::uuid,policy) RETURNING id INTO batch;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
   slot_index:=slot_index+1;
   IF (item->>'slot')::int IS DISTINCT FROM slot_index THEN RAISE EXCEPTION 'Invalid slot order'; END IF;
   SELECT property_id INTO source_property FROM public.morar_site_eligible WHERE public_id=(item->>'publicId')::uuid;
   IF NOT FOUND THEN RAISE EXCEPTION 'Featured property is no longer published'; END IF;
   photo_count := jsonb_array_length(item->'photos');
   IF photo_count NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid photo selection'; END IF;
   SELECT jsonb_agg(x.id ORDER BY x.rank,x.position,x.id) INTO expected_ids FROM (
     SELECT m.id,m.position,CASE WHEN m.id::text=d.document->'cover'->>'id' THEN 0 ELSE 1 END rank
     FROM public.morar_site_authorized_media m JOIN public.morar_site_documents d ON d.public_id=m.public_id
     WHERE m.public_id=(item->>'publicId')::uuid ORDER BY rank,m.position,m.id LIMIT 3
   ) x;
   SELECT jsonb_agg(p->>'id' ORDER BY (p->>'ordinal')::int) INTO supplied_ids FROM jsonb_array_elements(item->'photos') p;
   IF expected_ids IS DISTINCT FROM supplied_ids OR
      EXISTS(SELECT 1 FROM jsonb_array_elements(item->'photos') WITH ORDINALITY p(value,n) WHERE (value->>'ordinal')::int IS DISTINCT FROM n-1)
   THEN RAISE EXCEPTION 'Only the current cover and first photos can be treated'; END IF;
   INSERT INTO public.morar_site_featured_items(week_id,slot,public_id,property_id,expected_photos)
   VALUES(batch,(item->>'slot')::int,(item->>'publicId')::uuid,source_property,photo_count) RETURNING id INTO item_id;
   FOR photo IN SELECT value FROM jsonb_array_elements(item->'photos') LOOP
     IF NOT EXISTS(SELECT 1 FROM public.morar_site_authorized_media m WHERE m.id=(photo->>'id')::uuid
       AND m.version=photo->>'version' AND m.public_id=(item->>'publicId')::uuid AND m.position=(photo->>'position')::int) THEN
       RAISE EXCEPTION 'Featured photo is no longer authorized';
     END IF;
     INSERT INTO public.morar_site_featured_photos(item_id,ordinal,media_id,media_version,source_position)
     VALUES(item_id,(photo->>'ordinal')::int,(photo->>'id')::uuid,photo->>'version',(photo->>'position')::int);
   END LOOP;
 END LOOP;
 INSERT INTO public.morar_site_featured_events(week_id,kind,detail) VALUES(batch,'planned',jsonb_build_object('items',jsonb_array_length(_items),'treatment','faithful-tone-v1'));
 RETURN batch;
END $$;

CREATE FUNCTION public.morar_site_featured_claim(_week uuid,_lease uuid)
RETURNS SETOF public.morar_site_featured_photos
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE photo uuid;
BEGIN
 SELECT p.id INTO photo FROM public.morar_site_featured_photos p
 JOIN public.morar_site_featured_items i ON i.id=p.item_id
 JOIN public.morar_site_featured_weeks w ON w.id=i.week_id
 WHERE w.id=_week AND w.state='preparing' AND p.state='queued' AND p.attempts<3
 ORDER BY p.ordinal,i.slot FOR UPDATE OF p SKIP LOCKED LIMIT 1;
 IF photo IS NULL THEN RETURN; END IF;
 INSERT INTO public.morar_site_featured_events(week_id,photo_id,kind) VALUES(_week,photo,'processing');
 RETURN QUERY UPDATE public.morar_site_featured_photos SET state='processing',lease=_lease,
 lease_until=now()+interval '5 minutes', attempts=attempts+1,error=NULL WHERE id=photo RETURNING *;
END $$;

CREATE VIEW public.morar_site_featured_authorized_photos WITH(security_invoker=true) AS
SELECT p.id AS photo_id,p.media_id,p.media_version,p.source_position,p.ordinal,p.checksum,p.storage_prefix,p.width,p.height,p.variants,
 i.public_id,i.slot,i.week_id
FROM public.morar_site_featured_photos p
JOIN public.morar_site_featured_items i ON i.id=p.item_id
JOIN public.morar_site_featured_weeks w ON w.id=i.week_id
JOIN public.morar_site_authorized_media m ON m.id=p.media_id AND m.version=p.media_version
 AND m.public_id=i.public_id AND m.position=p.source_position
WHERE w.state='active' AND w.approved_at IS NOT NULL AND p.state='ready' AND p.treatment_version='faithful-tone-v1';
REVOKE ALL ON public.morar_site_featured_authorized_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.morar_site_featured_authorized_photos TO service_role;

CREATE FUNCTION public.morar_site_featured_activate(_week uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch public.morar_site_featured_weeks; n int;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('morar_site_featured_activate'));
 SELECT * INTO batch FROM public.morar_site_featured_weeks WHERE id=_week FOR UPDATE;
 IF NOT FOUND OR batch.state NOT IN ('preparing','ready','active') OR batch.approved_at IS NULL THEN RETURN false; END IF;
 IF batch.state='active' THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.morar_site_featured_weeks WHERE state='active' AND week_start>batch.week_start) THEN RETURN false; END IF;
 SELECT count(*) INTO n FROM public.morar_site_featured_items WHERE week_id=_week;
 IF n<>batch.expected_items THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.morar_site_featured_items i WHERE i.week_id=_week AND
   (SELECT count(*) FROM public.morar_site_featured_photos p WHERE p.item_id=i.id AND p.state='ready' AND p.treatment_version='faithful-tone-v1')<>i.expected_photos) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.morar_site_featured_photos p JOIN public.morar_site_featured_items i ON i.id=p.item_id
   WHERE i.week_id=_week AND NOT EXISTS(SELECT 1 FROM public.morar_site_authorized_media m
    WHERE m.id=p.media_id AND m.version=p.media_version AND m.public_id=i.public_id AND m.position=p.source_position)) THEN RETURN false; END IF;
 -- Complete weeks only; the previous active set remains visible while preparation runs.
 UPDATE public.morar_site_featured_weeks SET state='ended',active_until=now() WHERE state='active' AND id<>_week;
 UPDATE public.morar_site_featured_weeks SET state='active',active_from=coalesce(active_from,now()),active_until=NULL WHERE id=_week;
 INSERT INTO public.morar_site_featured_events(week_id,kind) VALUES(_week,'activated');
 RETURN true;
END $$;

CREATE FUNCTION public.morar_site_featured_active()
RETURNS TABLE(slot int,public_id uuid,media_id uuid,media_version text,checksum text,ordinal int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH active AS MATERIALIZED(SELECT id FROM public.morar_site_featured_weeks WHERE state='active' AND approved_at IS NOT NULL LIMIT 1)
 SELECT i.slot,i.public_id,p.media_id,p.media_version,p.checksum,p.ordinal FROM active w
 JOIN public.morar_site_featured_items i ON i.week_id=w.id
 JOIN public.morar_site_featured_photos p ON p.item_id=i.id AND p.state='ready' AND p.treatment_version='faithful-tone-v1'
 CROSS JOIN LATERAL(SELECT 1 FROM public.morar_site_authorized_media m WHERE m.id=p.media_id
  AND m.version=p.media_version AND m.public_id=i.public_id AND m.position=p.source_position LIMIT 1) valid
 ORDER BY i.slot,p.ordinal
$$;
REVOKE ALL ON FUNCTION public.morar_site_featured_plan(date,jsonb),public.morar_site_featured_claim(uuid,uuid),public.morar_site_featured_activate(uuid),public.morar_site_featured_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_featured_plan(date,jsonb),public.morar_site_featured_claim(uuid,uuid),public.morar_site_featured_activate(uuid),public.morar_site_featured_active() TO service_role;
