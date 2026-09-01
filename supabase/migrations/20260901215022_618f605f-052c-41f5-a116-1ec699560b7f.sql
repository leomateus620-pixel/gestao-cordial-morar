ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS localizacao_maps_url text,
  ADD COLUMN IF NOT EXISTS localizacao_maps_coords text;