-- Choose the single active week before resolving the authorized media view.
-- Both media views already require the listing to be eligible for their brand.
CREATE OR REPLACE FUNCTION public.cordial_site_showcase_active()
RETURNS TABLE(
  week_id uuid, public_id uuid, media_id uuid, media_version text, edited boolean,
  checksum text, storage_path text, width int, height int, focal_x numeric, focal_y numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active_week AS MATERIALIZED (
    SELECT id, public_id, media_id, media_version, use_original, approved_at,
      checksum, storage_path, width, height, focal_x, focal_y
    FROM public.cordial_site_showcase_weeks
    WHERE state = 'ativo'
    LIMIT 1
  )
  SELECT w.id, w.public_id, w.media_id, w.media_version,
    (NOT w.use_original AND w.storage_path IS NOT NULL AND w.approved_at IS NOT NULL),
    w.checksum, w.storage_path, w.width, w.height, w.focal_x, w.focal_y
  FROM active_week w
  CROSS JOIN LATERAL (
    SELECT 1 FROM public.cordial_site_authorized_media m
    WHERE m.id = w.media_id AND m.version = w.media_version AND m.public_id = w.public_id
    LIMIT 1
  ) authorized
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.morar_site_showcase_active()
RETURNS TABLE(
  week_id uuid, public_id uuid, media_id uuid, media_version text, edited boolean,
  checksum text, storage_path text, width int, height int, focal_x numeric, focal_y numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active_week AS MATERIALIZED (
    SELECT id, public_id, media_id, media_version, use_original, approved_at,
      checksum, storage_path, width, height, focal_x, focal_y
    FROM public.morar_site_showcase_weeks
    WHERE state = 'ativo'
    LIMIT 1
  )
  SELECT w.id, w.public_id, w.media_id, w.media_version,
    (NOT w.use_original AND w.storage_path IS NOT NULL AND w.approved_at IS NOT NULL),
    w.checksum, w.storage_path, w.width, w.height, w.focal_x, w.focal_y
  FROM active_week w
  CROSS JOIN LATERAL (
    SELECT 1 FROM public.morar_site_authorized_media m
    WHERE m.id = w.media_id AND m.version = w.media_version AND m.public_id = w.public_id
    LIMIT 1
  ) authorized
$$;
