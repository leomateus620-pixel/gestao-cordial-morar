-- Apply the existing isolated-tested correction to the connected database.
CREATE OR REPLACE FUNCTION public.cordial_site_sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_property_id uuid; target_field text;
BEGIN
 BEGIN
  target_field:=CASE WHEN TG_TABLE_NAME='properties' THEN 'id' ELSE 'property_id' END;
  target_property_id:=coalesce(to_jsonb(NEW)->>target_field,to_jsonb(OLD)->>target_field)::uuid;
  PERFORM public.cordial_site_sync_property(target_property_id);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'cordial_site_sync failed: %', SQLSTATE;
 END;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_sync_trigger() FROM PUBLIC,anon,authenticated;