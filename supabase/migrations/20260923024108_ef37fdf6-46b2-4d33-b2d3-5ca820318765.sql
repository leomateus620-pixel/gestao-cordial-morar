-- O vínculo remoto é um checkpoint de confirmação: exige o mesmo lease,
-- revisão e decisão de disponibilidade usados pelo job de mídia.
CREATE OR REPLACE FUNCTION public.property_media_link_write_if_owned(
  _job_id uuid, _lease_token uuid, _publication_id uuid,
  _image_id uuid, _fields jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _image_property_id uuid;
  _property public.properties;
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
  _columns text;
BEGIN
  IF _lease_token IS NULL OR jsonb_typeof(_fields) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  SELECT property_id INTO _image_property_id FROM public.property_images
   WHERE id = _image_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _property FROM public.properties
   WHERE id = _image_property_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _publication FROM public.property_provider_publications
   WHERE id = _publication_id AND property_id = _image_property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _job FROM public.property_sync_jobs
   WHERE id = _job_id AND lease_token = _lease_token AND status = 'processing'
     AND lock_expires_at > now() FOR UPDATE;
  IF NOT FOUND OR _job.property_id <> _image_property_id
     OR _job.provider <> _publication.provider OR _job.action <> 'media_sync'
     OR _job.requested_revision <> _property.gallery_revision
     OR _property.archived_at IS NOT NULL
     OR NOT _publication.enabled OR _publication.desired_availability <> 'visible'
     OR _publication.external_property_id IS NULL
     OR (_job.publication_intent_revision IS NOT NULL AND
         _job.publication_intent_revision <> _publication.publication_intent_revision) THEN
    RETURN false;
  END IF;
  IF NULLIF(_fields->>'external_image_id', '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.property_image_provider_publications l
     WHERE l.publication_id = _publication_id
       AND l.external_image_id = _fields->>'external_image_id'
       AND l.image_id <> _image_id AND l.deleted_at IS NULL
  ) THEN RETURN false; END IF;

  SELECT string_agg(quote_ident(k), ', ') INTO _columns
    FROM jsonb_object_keys(_fields) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'property_image_provider_publications'
        AND c.column_name = k
        AND c.column_name NOT IN (
          'id', 'image_id', 'publication_id', 'provider', 'created_at', 'updated_at'
        )
   );
  IF _columns IS NULL THEN RETURN false; END IF;
  INSERT INTO public.property_image_provider_publications
    (image_id, publication_id, provider)
  VALUES (_image_id, _publication_id, _publication.provider)
  ON CONFLICT (image_id, publication_id) DO NOTHING;
  EXECUTE format(
    'UPDATE public.property_image_provider_publications l SET (%s, updated_at) = '
    || '(SELECT %s, now() FROM jsonb_populate_record('
    || 'NULL::public.property_image_provider_publications, $1)) '
    || 'WHERE l.image_id = $2 AND l.publication_id = $3', _columns, _columns
  ) USING _fields, _image_id, _publication_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_media_link_write_if_owned(uuid,uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_media_link_write_if_owned(uuid,uuid,uuid,uuid,jsonb)
  TO service_role;