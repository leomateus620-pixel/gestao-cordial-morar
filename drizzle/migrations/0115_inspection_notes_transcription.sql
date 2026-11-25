ALTER TABLE public.inspection_notes
  ADD COLUMN transcription_state text
    CHECK (transcription_state IS NULL OR transcription_state IN ('pendente','transcrevendo','falhou','concluida')),
  ADD COLUMN transcription_error text CHECK (transcription_error IS NULL OR length(transcription_error) <= 200),
  ADD COLUMN transcription_attempts integer NOT NULL DEFAULT 0 CHECK (transcription_attempts >= 0),
  ADD COLUMN transcription_next_at timestamptz,
  ADD COLUMN transcription_lease_token uuid,
  ADD COLUMN transcription_lease_until timestamptz;

CREATE INDEX inspection_notes_transcription_idx
  ON public.inspection_notes (inspection_id)
  WHERE source = 'voz' AND transcript_original IS NULL;

CREATE OR REPLACE FUNCTION public.inspection_notes_transcription_default()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.source = 'voz' AND NEW.transcription_state IS NULL THEN NEW.transcription_state := 'pendente'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspection_notes_transcription_default
  BEFORE INSERT ON public.inspection_notes FOR EACH ROW
  EXECUTE FUNCTION public.inspection_notes_transcription_default();

CREATE OR REPLACE FUNCTION public.inspection_notes_touch_v2()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.inspection_id IS DISTINCT FROM OLD.inspection_id OR NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    RAISE EXCEPTION 'Identificadores da vistoria são imutáveis' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  IF ROW(NEW.approved_text, NEW.item_id, NEW.audio_path)
       IS DISTINCT FROM ROW(OLD.approved_text, OLD.item_id, OLD.audio_path)
     OR (NEW.status IS DISTINCT FROM OLD.status
         AND NOT (OLD.status = 'pendente_transcricao' AND NEW.status = 'transcrito')) THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER inspection_notes_touch ON public.inspection_notes;
CREATE TRIGGER inspection_notes_touch BEFORE UPDATE ON public.inspection_notes
  FOR EACH ROW EXECUTE FUNCTION public.inspection_notes_touch_v2();

DROP TRIGGER inspection_notes_aggregate ON public.inspection_notes;
CREATE TRIGGER inspection_notes_aggregate BEFORE INSERT OR DELETE ON public.inspection_notes
  FOR EACH ROW EXECUTE FUNCTION public.inspection_touch_aggregate();
CREATE TRIGGER inspection_notes_aggregate_upd BEFORE UPDATE ON public.inspection_notes
  FOR EACH ROW WHEN (
    ROW(NEW.approved_text, NEW.status, NEW.item_id, NEW.room_id, NEW.audio_path, NEW.transcript_original, NEW.suggestion)
    IS DISTINCT FROM
    ROW(OLD.approved_text, OLD.status, OLD.item_id, OLD.room_id, OLD.audio_path, OLD.transcript_original, OLD.suggestion))
  EXECUTE FUNCTION public.inspection_touch_aggregate();

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_claim(p_note uuid, p_segments integer DEFAULT 1)
RETURNS TABLE(claimed boolean, lease_token uuid, note jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.inspection_notes; t uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM public.inspection_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relato não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.inspection_can_edit(r.inspection_id) THEN
    RAISE EXCEPTION 'Vistoria concluída ou sem acesso para edição.' USING ERRCODE = '42501'; END IF;
  IF r.source <> 'voz' OR r.audio_path IS NULL OR r.transcript_original IS NOT NULL
     OR r.transcription_state = 'concluida'
     OR r.transcription_attempts >= 5
     OR (r.transcription_lease_until IS NOT NULL AND r.transcription_lease_until > now())
     OR (r.transcription_next_at IS NOT NULL AND r.transcription_next_at > now()) THEN
    RETURN QUERY SELECT false, NULL::uuid, to_jsonb(r); RETURN;
  END IF;
  UPDATE public.inspection_notes
     SET transcription_state = 'transcrevendo', transcription_error = NULL,
         transcription_lease_token = t,
         transcription_lease_until = now() + make_interval(mins => 10 * greatest(1, least(coalesce(p_segments,1), 6)))
   WHERE id = p_note RETURNING * INTO r;
  RETURN QUERY SELECT true, t, to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_renew(p_note uuid, p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.inspection_notes SET transcription_lease_until = now() + interval '10 minutes'
   WHERE id = p_note AND transcription_lease_token = p_token AND public.inspection_can_edit(inspection_id);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.inspection_note_transcription_finish(
  p_note uuid, p_token uuid, p_transcript text, p_suggestion jsonb, p_error text, p_retryable boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.inspection_notes;
BEGIN
  SELECT * INTO r FROM public.inspection_notes WHERE id = p_note FOR UPDATE;
  IF NOT FOUND OR r.transcription_lease_token IS DISTINCT FROM p_token THEN RETURN NULL; END IF;
  IF NOT public.inspection_can_edit(r.inspection_id) THEN
    RAISE EXCEPTION 'Vistoria concluída ou sem acesso para edição.' USING ERRCODE = '42501'; END IF;
  IF p_error IS NULL AND coalesce(btrim(p_transcript), '') <> '' THEN
    UPDATE public.inspection_notes SET transcript_original = p_transcript, suggestion = p_suggestion,
      status = CASE WHEN status = 'pendente_transcricao' THEN 'transcrito' ELSE status END,
      transcription_state = 'concluida', transcription_error = NULL, transcription_next_at = NULL,
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  ELSE
    UPDATE public.inspection_notes SET transcription_state = 'falhou',
      transcription_error = left(coalesce(p_error, 'Não foi possível entender o áudio.'), 200),
      transcription_attempts = transcription_attempts + CASE WHEN p_retryable THEN 0 ELSE 1 END,
      transcription_next_at = now() + make_interval(secs => least(3600, 30 * power(2, least(transcription_attempts, 7))::int)),
      transcription_lease_token = NULL, transcription_lease_until = NULL
    WHERE id = p_note RETURNING * INTO r;
  END IF;
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.inspection_note_transcription_claim(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_note_transcription_renew(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspection_notes_touch_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspection_notes_transcription_default() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_claim(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_renew(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspection_note_transcription_finish(uuid, uuid, text, jsonb, text, boolean) TO authenticated, service_role;