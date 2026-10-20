-- Verification only: asserts 0035 objects exist; aborts (rolling back 0035) otherwise.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('inspection_touch_aggregate','inspection_snapshot','inspection_reorder_media','inspection_finalize','inspection_list','inspection_create','inspection_finalize_server','inspection_media_position')
    AND array_to_string(proconfig,',') LIKE '%search_path=public%';
  IF n <> 8 THEN RAISE EXCEPTION '0035 verify: functions %', n; END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname IN ('inspection_rooms_aggregate','inspection_items_aggregate','inspection_media_aggregate','inspection_notes_aggregate','inspection_media_position_guard');
  IF n <> 5 THEN RAISE EXCEPTION '0035 verify: triggers %', n; END IF;
  IF has_function_privilege('authenticated','public.inspection_finalize(uuid,integer,text,integer,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.inspection_finalize(uuid,integer,text,integer,text,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.inspection_finalize_server(uuid,uuid,integer,text,integer,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION '0035 verify: finalize privileges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='inspection_media_obj_insert' AND with_check LIKE '%docs%') THEN
    RAISE EXCEPTION '0035 verify: storage policy';
  END IF;
  SELECT count(*) INTO n FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity
    AND relname IN ('inspections','inspection_rooms','inspection_items','inspection_media','inspection_notes','inspection_documents','inspection_events');
  IF n <> 7 THEN RAISE EXCEPTION '0035 verify: rls %', n; END IF;
END $$;
