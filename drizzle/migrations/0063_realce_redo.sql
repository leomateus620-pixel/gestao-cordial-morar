CREATE OR REPLACE FUNCTION public.realce_redo(p_item uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.realce_can_use() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.realce_items SET status = 'rascunho', result_path = NULL, result_width = NULL, result_height = NULL,
    result_note = NULL, decision = NULL, updated_at = now()
  WHERE id = p_item AND user_id = auth.uid() AND status = 'pronta';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_state'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.realce_redo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realce_redo(uuid) TO authenticated, service_role;