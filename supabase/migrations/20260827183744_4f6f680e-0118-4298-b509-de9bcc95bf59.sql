ALTER TABLE public.agenciamentos
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_operation_key TEXT;

ALTER TABLE public.agenciamentos
  DROP CONSTRAINT IF EXISTS agenciamentos_source_check;
ALTER TABLE public.agenciamentos
  ADD CONSTRAINT agenciamentos_source_check
  CHECK (source IN ('manual', 'property_registration'));

CREATE UNIQUE INDEX IF NOT EXISTS agenciamentos_source_operation_key_uidx
  ON public.agenciamentos (source_operation_key)
  WHERE source_operation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS agenciamentos_property_id_idx
  ON public.agenciamentos (property_id)
  WHERE property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agenciamentos_corretor_finalidade_idx
  ON public.agenciamentos (corretor_id, finalidade, data_agenciamento);

CREATE OR REPLACE FUNCTION public.agenciamentos_sync_provider_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  IF NEW.status <> 'published' THEN
    RETURN NULL;
  END IF;
  IF NEW.property_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.provider = 'morar' THEN
    UPDATE public.agenciamentos
    SET cadastrado_morar = true
    WHERE property_id = NEW.property_id
      AND COALESCE(cadastrado_morar, false) = false
      AND status NOT IN ('cancelado', 'reprovado');
  ELSIF NEW.provider = 'cordial' THEN
    UPDATE public.agenciamentos
    SET cadastrado_cordial = true
    WHERE property_id = NEW.property_id
      AND COALESCE(cadastrado_cordial, false) = false
      AND status NOT IN ('cancelado', 'reprovado');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS property_publications_sync_agenciamento
  ON public.property_provider_publications;
CREATE TRIGGER property_publications_sync_agenciamento
AFTER UPDATE OF status ON public.property_provider_publications
FOR EACH ROW EXECUTE FUNCTION public.agenciamentos_sync_provider_checklist();