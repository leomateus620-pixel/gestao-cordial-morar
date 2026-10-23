CREATE OR REPLACE FUNCTION public.property_history_photo_kind(_title text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _title LIKE 'Ordem%' OR _title = 'Capa trocada' THEN 'ordem'
              WHEN _title LIKE '%adicionad%' THEN 'add'
              WHEN _title LIKE '%removid%' THEN 'rem'
              ELSE _title END
$$;

CREATE OR REPLACE FUNCTION public.property_history_record(
  _property_id uuid, _category text, _title text, _changes jsonb, _summary text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _kind text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-history-actor';
  _name text;
  _existing public.property_history%ROWTYPE;
  _merged jsonb;
BEGIN
  SELECT * INTO _existing FROM public.property_history
   WHERE property_id = _property_id AND tx_id = txid_current() AND category = _category
     AND (_category NOT IN ('fotos','videos') OR public.property_history_photo_kind(title) = public.property_history_photo_kind(_title))
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF _category IN ('fotos','videos') THEN
      UPDATE public.property_history
         SET title = CASE WHEN _title = 'Capa trocada' AND title <> 'Capa trocada' THEN title ELSE _title END,
             summary = coalesce(_summary, summary),
             changes = changes || _changes
       WHERE id = _existing.id;
    ELSE
      SELECT coalesce(jsonb_agg(c), '[]'::jsonb) INTO _merged FROM (
        SELECT jsonb_build_object('field', f, 'from', fr, 'to', t, 'sensitive', s) c
        FROM (
          SELECT e->>'field' f,
                 (array_agg(e->'from' ORDER BY o))[1] fr,
                 (array_agg(e->'to' ORDER BY o DESC))[1] t,
                 bool_or((e->>'sensitive')::boolean) s
          FROM (SELECT e, o FROM jsonb_array_elements(_existing.changes || _changes) WITH ORDINALITY x(e, o)) z
          GROUP BY e->>'field'
        ) g WHERE fr IS DISTINCT FROM t
      ) q;
      UPDATE public.property_history SET changes = _merged, title = _title WHERE id = _existing.id;
    END IF;
    RETURN;
  END IF;

  IF _uid IS NOT NULL THEN
    SELECT nome INTO _name FROM public.profiles WHERE id = _uid;
    INSERT INTO public.property_history (property_id, actor_user_id, actor_name, actor_kind, category, title, summary, changes)
    VALUES (_property_id, _uid, coalesce(nullif(trim(_name), ''), 'Usuário'),
            CASE WHEN _kind = 'assistant' THEN 'assistant' ELSE 'user' END,
            _category, _title, _summary, _changes);
  ELSE
    INSERT INTO public.property_history (property_id, actor_name, actor_kind, category, title, summary, changes)
    VALUES (_property_id,
            CASE _kind WHEN 'sync_imobi' THEN 'Sync Imobi' ELSE 'Sistema' END,
            CASE WHEN _kind IN ('sync_imobi','worker') THEN _kind ELSE 'system' END,
            _category, _title, _summary, _changes);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.property_history_record(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;