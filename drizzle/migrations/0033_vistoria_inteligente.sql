CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  agency text NOT NULL DEFAULT 'cordial' CHECK (agency IN ('cordial','morar')),
  kind text NOT NULL CHECK (kind IN ('entrada','saida','periodica','constatacao')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_andamento','em_revisao','concluida')),
  responsible_id uuid NOT NULL,
  responsible_name text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  inspected_at timestamptz,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  furnished text NOT NULL DEFAULT 'nao_informado' CHECK (furnished IN ('nao_informado','nao','semimobiliado','mobiliado')),
  cleaning text NOT NULL DEFAULT 'nao_informado' CHECK (cleaning IN ('nao_informado','limpo','parcial','sujo','nao_se_aplica')),
  keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  meters jsonb NOT NULL DEFAULT '{}'::jsonb,
  property_snapshot jsonb NOT NULL,
  plan_confirmed boolean NOT NULL DEFAULT false,
  general_notes text,
  conclusion text,
  current_version integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_property_idx ON public.inspections(property_id, created_at DESC);
CREATE INDEX inspections_responsible_idx ON public.inspections(responsible_id, created_at DESC);
CREATE INDEX inspections_status_idx ON public.inspections(status, created_at DESC);

CREATE TABLE public.inspection_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'outro',
  position integer NOT NULL DEFAULT 0,
  no_photo_reason text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, inspection_id)
);
CREATE INDEX inspection_rooms_insp_idx ON public.inspection_rooms(inspection_id, position);

CREATE TABLE public.inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  room_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  category text NOT NULL DEFAULT 'base',
  position integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pendente' CHECK (state IN ('pendente','bom','regular','ruim','nao_testado','nao_se_aplica')),
  quantity numeric,
  material text,
  color text,
  notes text,
  damage text,
  untested_reason text,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, inspection_id),
  UNIQUE (id, room_id),
  FOREIGN KEY (room_id, inspection_id) REFERENCES public.inspection_rooms(id, inspection_id) ON DELETE CASCADE
);
CREATE INDEX inspection_items_room_idx ON public.inspection_items(room_id, position);
CREATE INDEX inspection_items_insp_idx ON public.inspection_items(inspection_id);

CREATE TABLE public.inspection_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  room_id uuid NOT NULL,
  item_id uuid,
  client_key text NOT NULL CHECK (length(client_key) BETWEEN 8 AND 120),
  storage_path text NOT NULL UNIQUE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  width integer,
  height integer,
  caption text,
  position integer NOT NULL DEFAULT 0,
  taken_at timestamptz,
  time_source text NOT NULL DEFAULT 'importacao' CHECK (time_source IN ('captura','importacao')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, client_key),
  CHECK (storage_path LIKE inspection_id::text || '/' || room_id::text || '/%'),
  FOREIGN KEY (room_id, inspection_id) REFERENCES public.inspection_rooms(id, inspection_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id, room_id) REFERENCES public.inspection_items(id, room_id) ON DELETE SET NULL (item_id)
);
CREATE INDEX inspection_media_room_idx ON public.inspection_media(room_id, position);

CREATE TABLE public.inspection_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  room_id uuid NOT NULL,
  item_id uuid,
  client_key text NOT NULL CHECK (length(client_key) BETWEEN 8 AND 120),
  source text NOT NULL CHECK (source IN ('voz','texto')),
  audio_path text,
  audio_mime text,
  audio_seconds numeric,
  transcript_original text,
  suggestion jsonb,
  approved_text text,
  status text NOT NULL DEFAULT 'pendente_transcricao' CHECK (status IN ('pendente_transcricao','transcrito','revisado','descartado')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, client_key),
  CHECK (audio_path IS NULL OR audio_path LIKE inspection_id::text || '/' || room_id::text || '/%'),
  FOREIGN KEY (room_id, inspection_id) REFERENCES public.inspection_rooms(id, inspection_id) ON DELETE CASCADE,
  FOREIGN KEY (item_id, room_id) REFERENCES public.inspection_items(id, room_id) ON DELETE SET NULL (item_id)
);
CREATE INDEX inspection_notes_room_idx ON public.inspection_notes(room_id, created_at);

CREATE TABLE public.inspection_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  storage_path text NOT NULL UNIQUE,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, version)
);

CREATE TABLE public.inspection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspection_events_insp_idx ON public.inspection_events(inspection_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_rooms, public.inspection_items, public.inspection_media, public.inspection_notes TO authenticated;
GRANT SELECT ON public.inspection_documents TO authenticated;
GRANT SELECT, INSERT ON public.inspection_events TO authenticated;
GRANT ALL ON public.inspections, public.inspection_rooms, public.inspection_items, public.inspection_media, public.inspection_notes, public.inspection_documents, public.inspection_events TO service_role;
REVOKE ALL ON public.inspections, public.inspection_rooms, public.inspection_items, public.inspection_media, public.inspection_notes, public.inspection_documents, public.inspection_events FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.inspection_can_access(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = p_id AND (
      public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
      OR (public.has_role(auth.uid(),'corretor') AND (i.responsible_id = auth.uid() OR i.created_by = auth.uid()))
    ))
$$;
CREATE OR REPLACE FUNCTION public.inspection_can_edit(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.inspection_can_access(p_id) AND EXISTS (
    SELECT 1 FROM public.inspections i WHERE i.id = p_id AND i.status <> 'concluida')
$$;
REVOKE ALL ON FUNCTION public.inspection_can_access(uuid), public.inspection_can_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_can_access(uuid), public.inspection_can_edit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inspection_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n jsonb := to_jsonb(NEW); o jsonb := to_jsonb(OLD);
BEGIN
  IF (n->>'inspection_id') IS DISTINCT FROM (o->>'inspection_id')
     OR (n ? 'room_id' AND (n->>'room_id') IS DISTINCT FROM (o->>'room_id'))
     OR (n ? 'storage_path' AND (n->>'storage_path') IS DISTINCT FROM (o->>'storage_path')) THEN
    RAISE EXCEPTION 'Identificadores da vistoria são imutáveis' USING ERRCODE = '22023';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.inspection_touch_root()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.property_snapshot IS DISTINCT FROM OLD.property_snapshot AND OLD.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Imóvel e identificação da vistoria são imutáveis' USING ERRCODE = '22023';
  END IF;
  IF NEW.current_version IS DISTINCT FROM OLD.current_version AND current_setting('inspection.finalizing', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Versão do laudo só muda pela conclusão' USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' AND current_setting('inspection.finalizing', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use a conclusão da vistoria' USING ERRCODE = '22023';
  END IF;
  IF OLD.status = 'concluida' AND current_setting('inspection.finalizing', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Vistoria concluída: reabra para revisão' USING ERRCODE = '22023';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER inspections_touch BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.inspection_touch_root();
CREATE TRIGGER inspection_rooms_touch BEFORE UPDATE ON public.inspection_rooms FOR EACH ROW EXECUTE FUNCTION public.inspection_touch();
CREATE TRIGGER inspection_items_touch BEFORE UPDATE ON public.inspection_items FOR EACH ROW EXECUTE FUNCTION public.inspection_touch();
CREATE TRIGGER inspection_media_touch BEFORE UPDATE ON public.inspection_media FOR EACH ROW EXECUTE FUNCTION public.inspection_touch();
CREATE TRIGGER inspection_notes_touch BEFORE UPDATE ON public.inspection_notes FOR EACH ROW EXECUTE FUNCTION public.inspection_touch();

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY inspections_select ON public.inspections FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
    OR (public.has_role(auth.uid(),'corretor') AND (responsible_id = auth.uid() OR created_by = auth.uid())));
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'rascunho' AND current_version = 0 AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
    OR (public.has_role(auth.uid(),'corretor') AND responsible_id = auth.uid())));
CREATE POLICY inspections_update ON public.inspections FOR UPDATE TO authenticated
  USING (public.inspection_can_access(id))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
    OR (public.has_role(auth.uid(),'corretor') AND responsible_id = auth.uid()));

CREATE POLICY inspection_rooms_select ON public.inspection_rooms FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_rooms_write ON public.inspection_rooms FOR INSERT TO authenticated WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_rooms_update ON public.inspection_rooms FOR UPDATE TO authenticated USING (public.inspection_can_edit(inspection_id)) WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_rooms_delete ON public.inspection_rooms FOR DELETE TO authenticated USING (public.inspection_can_edit(inspection_id));

CREATE POLICY inspection_items_select ON public.inspection_items FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_items_insert ON public.inspection_items FOR INSERT TO authenticated WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_items_update ON public.inspection_items FOR UPDATE TO authenticated USING (public.inspection_can_edit(inspection_id)) WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_items_delete ON public.inspection_items FOR DELETE TO authenticated USING (public.inspection_can_edit(inspection_id));

CREATE POLICY inspection_media_select ON public.inspection_media FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_media_insert ON public.inspection_media FOR INSERT TO authenticated WITH CHECK (public.inspection_can_edit(inspection_id) AND created_by = auth.uid());
CREATE POLICY inspection_media_update ON public.inspection_media FOR UPDATE TO authenticated USING (public.inspection_can_edit(inspection_id)) WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_media_delete ON public.inspection_media FOR DELETE TO authenticated USING (public.inspection_can_edit(inspection_id));

CREATE POLICY inspection_notes_select ON public.inspection_notes FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_notes_insert ON public.inspection_notes FOR INSERT TO authenticated WITH CHECK (public.inspection_can_edit(inspection_id) AND created_by = auth.uid());
CREATE POLICY inspection_notes_update ON public.inspection_notes FOR UPDATE TO authenticated USING (public.inspection_can_edit(inspection_id)) WITH CHECK (public.inspection_can_edit(inspection_id));
CREATE POLICY inspection_notes_delete ON public.inspection_notes FOR DELETE TO authenticated USING (public.inspection_can_edit(inspection_id));

CREATE POLICY inspection_documents_select ON public.inspection_documents FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_events_select ON public.inspection_events FOR SELECT TO authenticated USING (public.inspection_can_access(inspection_id));
CREATE POLICY inspection_events_insert ON public.inspection_events FOR INSERT TO authenticated WITH CHECK (public.inspection_can_access(inspection_id) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.inspection_review_issues(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pending_items', (SELECT count(*) FROM inspection_items WHERE inspection_id = p_id AND state = 'pendente'),
    'untested_without_reason', (SELECT count(*) FROM inspection_items WHERE inspection_id = p_id AND state = 'nao_testado' AND coalesce(trim(untested_reason),'') = ''),
    'damage_without_text', (SELECT count(*) FROM inspection_items WHERE inspection_id = p_id AND state = 'ruim' AND coalesce(trim(damage),'') = ''),
    'rooms_without_photo', (SELECT count(*) FROM inspection_rooms r WHERE r.inspection_id = p_id AND coalesce(trim(r.no_photo_reason),'') = ''
        AND NOT EXISTS (SELECT 1 FROM inspection_media m WHERE m.room_id = r.id AND m.status = 'confirmada')),
    'rooms', (SELECT count(*) FROM inspection_rooms WHERE inspection_id = p_id),
    'pending_media', (SELECT count(*) FROM inspection_media WHERE inspection_id = p_id AND status <> 'confirmada'),
    'unreviewed_notes', (SELECT count(*) FROM inspection_notes WHERE inspection_id = p_id AND status NOT IN ('revisado','descartado')),
    'missing_basics', (SELECT (inspected_at IS NULL)::int + (responsible_id IS NULL)::int FROM inspections WHERE id = p_id)
  ) WHERE public.inspection_can_access(p_id)
$$;

CREATE OR REPLACE FUNCTION public.inspection_finalize(p_id uuid, p_expected_revision integer, p_storage_path text, p_byte_size integer, p_sha256 text, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.inspections; issues jsonb; v_version int;
BEGIN
  IF NOT public.inspection_can_edit(p_id) THEN RAISE EXCEPTION 'Sem acesso a esta vistoria' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v FROM inspections WHERE id = p_id FOR UPDATE;
  IF v.revision <> p_expected_revision THEN RAISE EXCEPTION 'A vistoria mudou em outra tela; atualize antes de concluir' USING ERRCODE = '40001'; END IF;
  issues := public.inspection_review_issues(p_id);
  IF (issues->>'pending_items')::int > 0 OR (issues->>'untested_without_reason')::int > 0 OR (issues->>'damage_without_text')::int > 0
     OR (issues->>'rooms_without_photo')::int > 0 OR (issues->>'rooms')::int = 0 OR (issues->>'pending_media')::int > 0
     OR (issues->>'unreviewed_notes')::int > 0 OR (issues->>'missing_basics')::int > 0 THEN
    RAISE EXCEPTION 'Revisão incompleta: %', issues::text USING ERRCODE = '23514';
  END IF;
  v_version := v.current_version + 1;
  IF p_storage_path <> p_id::text || '/docs/v' || v_version || '.pdf' THEN RAISE EXCEPTION 'Caminho do laudo inválido' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'inspection-media' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'Arquivo do laudo não encontrado' USING ERRCODE = '22023';
  END IF;
  INSERT INTO inspection_documents(inspection_id, version, storage_path, byte_size, sha256, snapshot, created_by)
    VALUES (p_id, v_version, p_storage_path, p_byte_size, p_sha256, p_snapshot, auth.uid());
  PERFORM set_config('inspection.finalizing', 'on', true);
  UPDATE inspections SET status = 'concluida', completed_at = now(), current_version = v_version WHERE id = p_id;
  PERFORM set_config('inspection.finalizing', 'off', true);
  INSERT INTO inspection_events(inspection_id, event, details, actor_id) VALUES (p_id, 'concluida', jsonb_build_object('version', v_version), auth.uid());
  RETURN jsonb_build_object('version', v_version);
END $$;

CREATE OR REPLACE FUNCTION public.inspection_reopen(p_id uuid, p_expected_revision integer, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.inspections;
BEGIN
  IF NOT public.inspection_can_access(p_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM inspections WHERE id = p_id FOR UPDATE;
  IF v.status <> 'concluida' THEN RAISE EXCEPTION 'Só vistorias concluídas são reabertas' USING ERRCODE = '22023'; END IF;
  IF v.revision <> p_expected_revision THEN RAISE EXCEPTION 'A vistoria mudou em outra tela' USING ERRCODE = '40001'; END IF;
  PERFORM set_config('inspection.finalizing', 'on', true);
  UPDATE inspections SET status = 'em_revisao', completed_at = NULL WHERE id = p_id;
  PERFORM set_config('inspection.finalizing', 'off', true);
  INSERT INTO inspection_events(inspection_id, event, details, actor_id) VALUES (p_id, 'reaberta', jsonb_build_object('motivo', left(p_reason, 500), 'from_version', v.current_version), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.inspection_review_issues(uuid), public.inspection_finalize(uuid,integer,text,integer,text,jsonb), public.inspection_reopen(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_review_issues(uuid), public.inspection_finalize(uuid,integer,text,integer,text,jsonb), public.inspection_reopen(uuid,integer,text) TO authenticated, service_role;

CREATE POLICY inspection_media_obj_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-media' AND public.inspection_can_access(public._try_uuid((storage.foldername(name))[1])));
CREATE POLICY inspection_media_obj_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-media' AND public.inspection_can_edit(public._try_uuid((storage.foldername(name))[1])));
CREATE POLICY inspection_media_obj_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-media' AND (storage.foldername(name))[2] <> 'docs' AND public.inspection_can_edit(public._try_uuid((storage.foldername(name))[1])));