ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS media_no_progress_runs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_attention_reason text;
COMMENT ON COLUMN public.property_provider_publications.media_no_progress_runs IS 'Rodadas seguidas de envio de fotos sem progresso; ao atingir o limite a publicação fica em needs_attention.';
COMMENT ON COLUMN public.property_provider_publications.media_attention_reason IS 'Mensagem exibida no card quando as fotos precisam de ação (Reenviar fotos).';