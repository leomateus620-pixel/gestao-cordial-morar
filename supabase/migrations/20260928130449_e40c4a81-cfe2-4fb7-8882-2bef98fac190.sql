ALTER TABLE public.agenciamentos
  ADD COLUMN IF NOT EXISTS placa_foto_path text,
  ADD COLUMN IF NOT EXISTS placa_foto_mime text,
  ADD COLUMN IF NOT EXISTS placa_foto_uploaded_at timestamptz;

CREATE OR REPLACE FUNCTION public.agenciamentos_enforce_placa_foto()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.placa_foto_path IS NULL OR btrim(NEW.placa_foto_path) = '' THEN
    NEW.placa_foto_path := NULL;
    NEW.placa_foto_mime := NULL;
    NEW.placa_foto_uploaded_at := NULL;
    -- Liga sem foto: bloqueia. Legado (já true sem foto) só cai quando a foto é removida.
    IF NEW.placa_instalada AND (TG_OP = 'INSERT' OR NOT OLD.placa_instalada
        OR OLD.placa_foto_path IS NOT NULL) THEN
      NEW.placa_instalada := false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agenciamentos_enforce_placa_foto ON public.agenciamentos;
CREATE TRIGGER agenciamentos_enforce_placa_foto
  BEFORE INSERT OR UPDATE ON public.agenciamentos
  FOR EACH ROW EXECUTE FUNCTION public.agenciamentos_enforce_placa_foto();

CREATE OR REPLACE FUNCTION public.agenciamento_can_edit(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenciamentos a
    WHERE a.id = _id AND (
      a.created_by = auth.uid()
      OR a.corretor_id = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.agenciamento_can_edit(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agenciamento_can_edit(uuid) TO authenticated;

DROP POLICY IF EXISTS agenciamento_placa_objects_select ON storage.objects;
CREATE POLICY agenciamento_placa_objects_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'agenciamento-placa-photos'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenciamento_can_edit(public._try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS agenciamento_placa_objects_insert ON storage.objects;
CREATE POLICY agenciamento_placa_objects_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'agenciamento-placa-photos'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenciamento_can_edit(public._try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS agenciamento_placa_objects_delete ON storage.objects;
CREATE POLICY agenciamento_placa_objects_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'agenciamento-placa-photos'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenciamento_can_edit(public._try_uuid((storage.foldername(name))[1])));