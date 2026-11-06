CREATE TABLE public.owned_channel_inventory (
  id bigserial PRIMARY KEY,
  snapshot text NOT NULL,
  property_id uuid NOT NULL,
  property_checksum text NOT NULL,
  media_checksum text NOT NULL,
  cordial_state text,
  morar_state text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot, property_id)
);
GRANT ALL ON public.owned_channel_inventory TO service_role;
GRANT SELECT ON public.owned_channel_inventory TO authenticated;
ALTER TABLE public.owned_channel_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read inventory" ON public.owned_channel_inventory FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY meta_reviewer_block ON public.owned_channel_inventory AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer'));

CREATE OR REPLACE FUNCTION public.owned_channel_take_inventory(_snapshot text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO owned_channel_inventory(snapshot,property_id,property_checksum,media_checksum,cordial_state,morar_state)
  SELECT _snapshot, p.id,
    md5((to_jsonb(p) - 'updated_at')::text),
    coalesce((SELECT md5(string_agg(i.id::text||'|'||coalesce(i.position::text,'')||'|'||i.is_cover::text||'|'||coalesce(i.storage_path,'')||'|'||coalesce(i.original_checksum,'')||'|'||coalesce(i.processing_status,''),',' ORDER BY i.id)) FROM property_images i WHERE i.property_id=p.id),'none'),
    c.state, m.state
  FROM properties p
  LEFT JOIN cordial_site_publications c ON c.property_id=p.id
  LEFT JOIN morar_site_publications m ON m.property_id=p.id
  ON CONFLICT (snapshot,property_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.owned_channel_take_inventory(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owned_channel_take_inventory(text) TO service_role;
SELECT public.owned_channel_take_inventory('before_20261106');