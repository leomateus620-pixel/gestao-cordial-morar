CREATE POLICY "property_images_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-images');
CREATE POLICY "property_images_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-images');
CREATE POLICY "property_images_modify" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-images') WITH CHECK (bucket_id = 'property-images');
CREATE POLICY "property_images_remove" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-images');