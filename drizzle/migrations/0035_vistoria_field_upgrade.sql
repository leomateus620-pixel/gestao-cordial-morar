-- All child writes serialize on the root. A document revision covers every child.
CREATE OR REPLACE FUNCTION public.inspection_touch_aggregate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := coalesce(to_jsonb(NEW)->>'inspection_id', to_jsonb(OLD)->>'inspection_id')::uuid;
BEGIN
  PERFORM 1 FROM inspections WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF NOT inspection_can_edit(v_id) THEN RAISE EXCEPTION 'Vistoria indisponível para edição' USING ERRCODE = '42501'; END IF;
    UPDATE inspections SET updated_at = now(), plan_confirmed = CASE
      WHEN TG_TABLE_NAME='inspection_rooms' AND (TG_OP<>'UPDATE' OR (to_jsonb(NEW)->>'name',to_jsonb(NEW)->>'kind',to_jsonb(NEW)->>'position') IS DISTINCT FROM (to_jsonb(OLD)->>'name',to_jsonb(OLD)->>'kind',to_jsonb(OLD)->>'position')) THEN false ELSE plan_confirmed END
    WHERE id = v_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inspection_touch_aggregate() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inspection_rooms_aggregate BEFORE INSERT OR UPDATE OR DELETE ON inspection_rooms FOR EACH ROW EXECUTE FUNCTION inspection_touch_aggregate();
CREATE TRIGGER inspection_items_aggregate BEFORE INSERT OR UPDATE OR DELETE ON inspection_items FOR EACH ROW EXECUTE FUNCTION inspection_touch_aggregate();
CREATE TRIGGER inspection_media_aggregate BEFORE INSERT OR UPDATE OR DELETE ON inspection_media FOR EACH ROW EXECUTE FUNCTION inspection_touch_aggregate();
CREATE TRIGGER inspection_notes_aggregate BEFORE INSERT OR UPDATE OR DELETE ON inspection_notes FOR EACH ROW EXECUTE FUNCTION inspection_touch_aggregate();

-- Canonical, transactionally coherent input for server-side PDF rendering.
CREATE OR REPLACE FUNCTION public.inspection_snapshot(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v inspections;
BEGIN
  IF NOT inspection_can_access(p_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM inspections WHERE id = p_id FOR UPDATE;
  RETURN jsonb_build_object('inspection', to_jsonb(v),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY position, id) FROM inspection_rooms r WHERE inspection_id = p_id),'[]'::jsonb),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY room_id, position, id) FROM inspection_items i WHERE inspection_id = p_id),'[]'::jsonb),
    'media', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY room_id, position, created_at, id) FROM inspection_media m WHERE inspection_id = p_id),'[]'::jsonb),
    'notes', coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at, id) FROM inspection_notes n WHERE inspection_id = p_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.inspection_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_snapshot(uuid) TO authenticated, service_role;

-- Atomic ordering with optimistic aggregate revision; never two independent swaps.
CREATE OR REPLACE FUNCTION public.inspection_reorder_media(p_id uuid, p_room uuid, p_revision integer, p_order uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v inspections;
BEGIN
  SELECT * INTO v FROM inspections WHERE id=p_id FOR UPDATE;
  IF NOT inspection_can_edit(p_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
  IF v.revision<>p_revision THEN RAISE EXCEPTION 'A ordem mudou; atualize' USING ERRCODE='40001'; END IF;
  IF cardinality(p_order)<>(SELECT count(*) FROM inspection_media WHERE inspection_id=p_id AND room_id=p_room)
    OR cardinality(p_order)<>(SELECT count(DISTINCT x) FROM unnest(p_order) x)
    OR EXISTS(SELECT 1 FROM unnest(p_order) x WHERE NOT EXISTS(SELECT 1 FROM inspection_media WHERE id=x AND inspection_id=p_id AND room_id=p_room)) THEN
    RAISE EXCEPTION 'Lista de fotos inválida' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('inspection.reordering','on',true);
  UPDATE inspection_media m SET position=o.pos-1 FROM unnest(p_order) WITH ORDINALITY o(id,pos) WHERE m.id=o.id;
  PERFORM set_config('inspection.reordering','off',true);
END $$;
REVOKE ALL ON FUNCTION public.inspection_reorder_media(uuid,uuid,integer,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_reorder_media(uuid,uuid,integer,uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inspection_finalize(p_id uuid, p_expected_revision integer, p_storage_path text, p_byte_size integer, p_sha256 text, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.inspections; issues jsonb; v_version int;
BEGIN
  IF NOT public.inspection_can_edit(p_id) THEN RAISE EXCEPTION 'Sem acesso a esta vistoria' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM inspections WHERE id = p_id FOR UPDATE;
  IF v.revision <> p_expected_revision THEN RAISE EXCEPTION 'A vistoria mudou em outra tela; atualize antes de concluir' USING ERRCODE = '40001'; END IF;
  IF p_snapshot IS DISTINCT FROM public.inspection_snapshot(p_id) THEN
    RAISE EXCEPTION 'Os dados do laudo mudaram; revise e gere novamente' USING ERRCODE = '40001';
  END IF;
  issues := public.inspection_review_issues(p_id);
  IF (issues->>'pending_items')::int > 0 OR (issues->>'untested_without_reason')::int > 0 OR (issues->>'damage_without_text')::int > 0
     OR (issues->>'rooms_without_photo')::int > 0 OR (issues->>'rooms')::int = 0 OR (issues->>'pending_media')::int > 0
     OR (issues->>'unreviewed_notes')::int > 0 OR (issues->>'missing_basics')::int > 0 OR NOT v.plan_confirmed THEN
    RAISE EXCEPTION 'Revisão incompleta: %', issues::text USING ERRCODE = '23514';
  END IF;
  v_version := v.current_version + 1;
  -- Nome do arquivo inclui o início do hash: nova tentativa com outro conteúdo não sobrescreve a anterior.
  IF p_sha256 !~ '^[0-9a-f]{64}$' OR p_storage_path <> p_id::text || '/docs/v' || v_version || '-' || left(p_sha256, 16) || '.pdf' THEN
    RAISE EXCEPTION 'Caminho do laudo inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'inspection-media' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'Arquivo do laudo não encontrado' USING ERRCODE = '22023';
  END IF;
  INSERT INTO inspection_documents(inspection_id, version, storage_path, byte_size, sha256, snapshot, created_by)
    VALUES (p_id, v_version, p_storage_path, p_byte_size, p_sha256, public.inspection_snapshot(p_id), auth.uid());
  PERFORM set_config('inspection.finalizing', 'on', true);
  UPDATE inspections SET status = 'concluida', completed_at = now(), current_version = v_version WHERE id = p_id;
  PERFORM set_config('inspection.finalizing', 'off', true);
  INSERT INTO inspection_events(inspection_id, event, details, actor_id) VALUES (p_id, 'concluida', jsonb_build_object('version', v_version), auth.uid());
  RETURN jsonb_build_object('version', v_version);
END $$;
REVOKE ALL ON FUNCTION public.inspection_finalize(uuid,integer,text,integer,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_finalize(uuid,integer,text,integer,text,jsonb) TO authenticated, service_role;

-- RLS applies to rows, counts and resume card in the same scope. No media blobs.
CREATE OR REPLACE FUNCTION public.inspection_list(p_q text, p_status text, p_kind text, p_agency text, p_from timestamptz, p_to timestamptz, p_date_field text, p_responsible uuid, p_page integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH scoped AS (
  SELECT i.* FROM inspections i WHERE (p_agency IS NULL OR agency=p_agency)
    AND (p_kind IS NULL OR kind=p_kind) AND (p_responsible IS NULL OR responsible_id=p_responsible)
    AND (p_q IS NULL OR property_snapshot->>'search_text' ILIKE '%'||p_q||'%')
    AND (p_from IS NULL OR (CASE WHEN p_date_field='created_at' THEN created_at ELSE inspected_at END)>=p_from)
    AND (p_to IS NULL OR (CASE WHEN p_date_field='created_at' THEN created_at ELSE inspected_at END)<p_to)
), filtered AS (SELECT * FROM scoped WHERE p_status IS NULL OR status=p_status),
page_rows AS (SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET greatest(p_page,0)*20),
resume AS (SELECT * FROM filtered WHERE status<>'concluida' ORDER BY updated_at DESC,id LIMIT 1)
SELECT jsonb_build_object(
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY updated_at DESC,id) FROM page_rows p),'[]'::jsonb),
  'total',(SELECT count(*) FROM filtered),'scopeTotal',(SELECT count(*) FROM scoped),'pageSize',20,
  'byStatus',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM scoped GROUP BY status) c),'{}'::jsonb),
  'continueInspection',(SELECT to_jsonb(r)||jsonb_build_object(
    'last_room',(SELECT rr.name FROM inspection_rooms rr WHERE rr.inspection_id=r.id ORDER BY greatest(rr.updated_at,coalesce((SELECT max(updated_at) FROM inspection_items WHERE room_id=rr.id),rr.updated_at),coalesce((SELECT max(updated_at) FROM inspection_media WHERE room_id=rr.id),rr.updated_at),coalesce((SELECT max(updated_at) FROM inspection_notes WHERE room_id=rr.id),rr.updated_at)) DESC,rr.id LIMIT 1),
    'pending_items',(SELECT count(*) FROM inspection_items WHERE inspection_id=r.id AND (state='pendente' OR (state='ruim' AND coalesce(trim(damage),'')='') OR (state='nao_testado' AND coalesce(trim(untested_reason),'')=''))),
    'pending_media',(SELECT count(*) FROM inspection_media WHERE inspection_id=r.id AND status<>'confirmada')) FROM resume r));
$$;
REVOKE ALL ON FUNCTION public.inspection_list(text,text,text,text,timestamptz,timestamptz,text,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_list(text,text,text,text,timestamptz,timestamptz,text,uuid,integer) TO authenticated,service_role;

-- Creation and its suggested checklist commit together. A retry reuses the UUID.
CREATE OR REPLACE FUNCTION public.inspection_create(p_inspection jsonb, p_rooms jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid:=(p_inspection->>'id')::uuid; existing inspections; r jsonb; room_id uuid; pos integer:=0;
BEGIN
  SELECT * INTO existing FROM inspections WHERE id=v_id;
  IF FOUND THEN
    IF existing.property_id<>(p_inspection->>'property_id')::uuid THEN RAISE EXCEPTION 'O rascunho pertence a outro imóvel' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('id',v_id,'reused',true);
  END IF;
  INSERT INTO inspections(id,property_id,agency,kind,responsible_id,responsible_name,created_by,inspected_at,participants,furnished,cleaning,keys,meters,property_snapshot,plan_confirmed)
    VALUES(v_id,(p_inspection->>'property_id')::uuid,p_inspection->>'agency',p_inspection->>'kind',(p_inspection->>'responsible_id')::uuid,p_inspection->>'responsible_name',auth.uid(),(p_inspection->>'inspected_at')::timestamptz,p_inspection->'participants',p_inspection->>'furnished',p_inspection->>'cleaning',p_inspection->'keys',p_inspection->'meters',p_inspection->'property_snapshot',(p_inspection->>'plan_confirmed')::boolean);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
    INSERT INTO inspection_rooms(inspection_id,name,kind,position) VALUES(v_id,r->>'name',r->>'kind',pos) RETURNING id INTO room_id;
    INSERT INTO inspection_items(inspection_id,room_id,name,category,position)
      SELECT v_id,room_id,it->>'name',it->>'category',ord-1 FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(it,ord);
    pos:=pos+1;
  END LOOP;
  UPDATE inspections SET plan_confirmed=(p_inspection->>'plan_confirmed')::boolean WHERE id=v_id;
  INSERT INTO inspection_events(inspection_id,event,details,actor_id) VALUES(v_id,'criada',jsonb_build_object('rooms',pos),auth.uid());
  RETURN jsonb_build_object('id',v_id,'reused',false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO existing FROM inspections WHERE id=v_id;
  IF NOT FOUND OR existing.property_id<>(p_inspection->>'property_id')::uuid THEN RAISE; END IF;
  RETURN jsonb_build_object('id',v_id,'reused',true);
END $$;
REVOKE ALL ON FUNCTION public.inspection_create(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inspection_create(jsonb,jsonb) TO authenticated,service_role;

-- Only the authenticated application server may register an official PDF. The
-- actor is rechecked by the existing finalization RPC under its real scope.
REVOKE EXECUTE ON FUNCTION public.inspection_finalize(uuid,integer,text,integer,text,jsonb) FROM authenticated;
CREATE OR REPLACE FUNCTION public.inspection_finalize_server(p_actor uuid,p_id uuid,p_expected_revision integer,p_storage_path text,p_byte_size integer,p_sha256 text,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous_sub text:=current_setting('request.jwt.claim.sub',true); result jsonb;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Autor obrigatório' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  result:=public.inspection_finalize(p_id,p_expected_revision,p_storage_path,p_byte_size,p_sha256,p_snapshot);
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.inspection_media_position()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM 1 FROM inspections WHERE id=NEW.inspection_id FOR UPDATE;
    SELECT coalesce(max(position)+1,0) INTO NEW.position FROM inspection_media WHERE room_id=NEW.room_id;
  ELSIF NEW.position IS DISTINCT FROM OLD.position AND current_setting('inspection.reordering',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use a ordenação atômica de fotos' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inspection_media_position() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inspection_media_position_guard BEFORE INSERT OR UPDATE ON inspection_media FOR EACH ROW EXECUTE FUNCTION inspection_media_position();

DROP POLICY inspection_media_obj_insert ON storage.objects;
CREATE POLICY inspection_media_obj_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='inspection-media' AND (storage.foldername(name))[2]<>'docs' AND public.inspection_can_edit(public._try_uuid((storage.foldername(name))[1])));
