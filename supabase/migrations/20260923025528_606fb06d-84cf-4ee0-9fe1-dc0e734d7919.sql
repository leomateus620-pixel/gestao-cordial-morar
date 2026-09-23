REVOKE ALL ON public.backup_20260923_property_images, public.backup_20260923_image_links,
  public.backup_20260923_sync_jobs, public.backup_20260923_publications FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.backup_20260923_property_images IS 'Snapshot 23/09/2026 antes da correção da fila de fotos. Reter até 7 dias após estabilização; apagar só com autorização.';
COMMENT ON TABLE public.backup_20260923_image_links IS 'Snapshot 23/09/2026. Reter até 7 dias após estabilização; apagar só com autorização.';
COMMENT ON TABLE public.backup_20260923_sync_jobs IS 'Snapshot 23/09/2026. Reter até 7 dias após estabilização; apagar só com autorização.';
COMMENT ON TABLE public.backup_20260923_publications IS 'Snapshot 23/09/2026. Reter até 7 dias após estabilização; apagar só com autorização.';