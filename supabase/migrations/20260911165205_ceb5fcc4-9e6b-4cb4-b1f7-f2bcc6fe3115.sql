ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS remote_codigo_proprietario TEXT,
  ADD COLUMN IF NOT EXISTS remote_codigo_corretor TEXT,
  ADD COLUMN IF NOT EXISTS remote_codigo_usuario_adicional TEXT,
  ADD COLUMN IF NOT EXISTS remote_links_synced_at TIMESTAMPTZ;