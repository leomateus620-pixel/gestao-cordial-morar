-- Preserve caller RLS. The authenticated wrapper is the supported public entry
-- point; the explicit-user helper remains restricted to service_role.
CREATE OR REPLACE FUNCTION public.assistant_action_target_access(_type text,_payload jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_role text:=split_part(public.assistant_current_scope(),':',1); v_id uuid; v_agency text;
BEGIN
 IF v_uid IS NULL OR v_role NOT IN ('admin','secretaria','corretor') THEN RETURN false; END IF;
 IF _payload ? 'attendanceId' THEN
   v_id:=(_payload->>'attendanceId')::uuid;
   IF NOT public.attendance_can_access(v_id) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'clientId' THEN
   IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=(_payload->>'clientId')::uuid
     AND public.current_user_has_notification_agency_access(c.brand::text)
     AND (v_role IN ('admin','secretaria') OR c.created_by=v_uid OR c.assigned_broker_id::text=v_uid::text)) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'agency' THEN
   v_agency:=_payload->>'agency';
   IF v_agency NOT IN ('cordial','morar','ambas') OR NOT public.current_user_has_notification_agency_access(v_agency) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'propertyId' AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=(_payload->>'propertyId')::uuid AND p.archived_at IS NULL) THEN RETURN false; END IF;
 IF _type='shared_selection' THEN
   IF jsonb_typeof(_payload->'propertyIds')<>'array' OR jsonb_array_length(_payload->'propertyIds') NOT BETWEEN 1 AND 60 THEN RETURN false; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(_payload->'propertyIds') i(id) LEFT JOIN public.properties p ON p.id=i.id::uuid WHERE p.id IS NULL OR p.archived_at IS NOT NULL) THEN RETURN false; END IF;
   IF _payload ? 'brokerId' AND (_payload->>'brokerId')::uuid<>v_uid AND v_role NOT IN ('admin','secretaria') THEN RETURN false; END IF;
 END IF;
 IF _type IN ('attendance_note','attendance_stage_change','message_draft') AND NOT (_payload ? 'attendanceId') THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
NOTIFY pgrst,'reload schema';
