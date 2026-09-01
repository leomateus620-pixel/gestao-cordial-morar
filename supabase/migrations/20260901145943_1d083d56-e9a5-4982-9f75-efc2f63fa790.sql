CREATE POLICY "Fotos Drive - leitura autenticada" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'property-drive-photos');
CREATE POLICY "Fotos Drive - envio autenticado" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'property-drive-photos');
CREATE POLICY "Fotos Drive - atualização autenticada" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'property-drive-photos');
CREATE POLICY "Fotos Drive - remoção autenticada" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'property-drive-photos');