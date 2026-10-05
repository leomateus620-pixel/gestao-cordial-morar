-- Existing Gestão objects not needed by the earlier Cordial/retirement test fixtures.
-- Existing production indexes (20260819195926 / 20260827132115), essential for full-snapshot QA.
CREATE INDEX IF NOT EXISTS property_images_property_idx ON public.property_images(property_id,position);
CREATE INDEX IF NOT EXISTS ppp_property_provider_idx ON public.property_provider_publications(provider,property_id);
CREATE TABLE public.user_agencies(user_id uuid REFERENCES auth.users(id),agency text,PRIMARY KEY(user_id,agency));
ALTER FUNCTION public.has_role(uuid,text) SECURITY DEFINER;
ALTER FUNCTION public.has_role(uuid,public.app_role) SECURITY DEFINER;
GRANT SELECT ON public.user_agencies,public.properties,public.property_provider_publications TO authenticated;
ALTER TABLE public.property_images
 ADD COLUMN pending_remote_delete boolean DEFAULT false,
 ADD COLUMN original_storage_path text,
 ADD COLUMN destination_hash text,
 ADD COLUMN desired_destination_hash text,
 ADD COLUMN processing_error_code text,
 ADD COLUMN processing_error_message text;
CREATE TABLE public.property_image_legacy_review(image_id uuid,review_status text);
CREATE FUNCTION public.property_expected_watermark_hash(_targets text[]) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN 'cordial'=ANY(coalesce(_targets,'{}'::text[])) AND NOT ('morar'=ANY(coalesce(_targets,'{}'::text[]))) THEN 'cordial@v2'
 WHEN 'morar'=ANY(coalesce(_targets,'{}'::text[])) AND NOT ('cordial'=ANY(coalesce(_targets,'{}'::text[]))) THEN 'morar@v2' ELSE 'morar-cordial@v2' END
$$;
INSERT INTO public.user_roles VALUES('00000000-0000-4000-8000-000000000001','admin');
