CREATE POLICY "Vídeos de imóveis - leitura autenticada"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-videos');
CREATE POLICY "Vídeos de imóveis - envio autenticado"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-videos');
CREATE POLICY "Vídeos de imóveis - atualização autenticada"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-videos');
CREATE POLICY "Vídeos de imóveis - remoção autenticada"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-videos');