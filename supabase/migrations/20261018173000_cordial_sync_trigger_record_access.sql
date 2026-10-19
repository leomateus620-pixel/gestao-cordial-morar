-- Correct only trigger target extraction. Preserve reconciliation decisions and
-- the exception boundary that prevents synchronization from blocking Gestão writes.
CREATE OR REPLACE FUNCTION public.cordial_site_sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_property_id uuid; target_field text;
BEGIN
 BEGIN
  target_field:=CASE WHEN TG_TABLE_NAME='properties' THEN 'id' ELSE 'property_id' END;
  -- PostgreSQL resolves NEW/OLD record fields before evaluating SQL CASE branches.
  -- properties has no property_id; JSON extraction works for all three row types
  -- and for INSERT/UPDATE/DELETE, as the existing Morar trigger already does.
  target_property_id:=coalesce(to_jsonb(NEW)->>target_field,to_jsonb(OLD)->>target_field)::uuid;
  PERFORM public.cordial_site_sync_property(target_property_id);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cordial_site_sync failed: %', SQLSTATE;
 END;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_sync_trigger() FROM PUBLIC,anon,authenticated;
