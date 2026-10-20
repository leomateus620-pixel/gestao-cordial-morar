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
    VALUES (p_id, v_version, p_storage_path, p_byte_size, p_sha256, p_snapshot, auth.uid());
  PERFORM set_config('inspection.finalizing', 'on', true);
  UPDATE inspections SET status = 'concluida', completed_at = now(), current_version = v_version WHERE id = p_id;
  PERFORM set_config('inspection.finalizing', 'off', true);
  INSERT INTO inspection_events(inspection_id, event, details, actor_id) VALUES (p_id, 'concluida', jsonb_build_object('version', v_version), auth.uid());
  RETURN jsonb_build_object('version', v_version);
END $$;
REVOKE ALL ON FUNCTION public.inspection_finalize(uuid,integer,text,integer,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_finalize(uuid,integer,text,integer,text,jsonb) TO authenticated, service_role;