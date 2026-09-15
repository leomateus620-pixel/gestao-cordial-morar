-- 1) Agenciamento: preenche códigos vazios a partir do imóvel vinculado
CREATE OR REPLACE FUNCTION public.agenciamentos_fill_codes_from_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.codigo_cordial, '')), '') IS NOT NULL
     AND NULLIF(btrim(COALESCE(NEW.codigo_morar, '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT codigo_cordial, codigo_morar INTO p
  FROM public.properties WHERE id = NEW.property_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.codigo_cordial, '')), '') IS NULL THEN
    NEW.codigo_cordial := NULLIF(btrim(COALESCE(p.codigo_cordial, '')), '');
  END IF;
  IF NULLIF(btrim(COALESCE(NEW.codigo_morar, '')), '') IS NULL THEN
    NEW.codigo_morar := NULLIF(btrim(COALESCE(p.codigo_morar, '')), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenciamentos_fill_codes_from_property ON public.agenciamentos;
CREATE TRIGGER agenciamentos_fill_codes_from_property
BEFORE INSERT OR UPDATE OF property_id, codigo_cordial, codigo_morar
ON public.agenciamentos
FOR EACH ROW EXECUTE FUNCTION public.agenciamentos_fill_codes_from_property();

-- 2) Imóvel: ao receber/alterar código, propaga só para colunas vazias dos agenciamentos vinculados
CREATE OR REPLACE FUNCTION public.properties_propagate_codes_to_agenciamentos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cordial text := NULLIF(btrim(COALESCE(NEW.codigo_cordial, '')), '');
  v_morar   text := NULLIF(btrim(COALESCE(NEW.codigo_morar, '')), '');
BEGIN
  IF v_cordial IS NULL AND v_morar IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.agenciamentos a
  SET codigo_cordial = COALESCE(NULLIF(btrim(COALESCE(a.codigo_cordial, '')), ''), v_cordial),
      codigo_morar   = COALESCE(NULLIF(btrim(COALESCE(a.codigo_morar, '')), ''), v_morar)
  WHERE a.property_id = NEW.id
    AND (
      (v_cordial IS NOT NULL AND NULLIF(btrim(COALESCE(a.codigo_cordial, '')), '') IS NULL)
      OR (v_morar IS NOT NULL AND NULLIF(btrim(COALESCE(a.codigo_morar, '')), '') IS NULL)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_propagate_codes_to_agenciamentos ON public.properties;
CREATE TRIGGER properties_propagate_codes_to_agenciamentos
AFTER INSERT OR UPDATE OF codigo_cordial, codigo_morar
ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.properties_propagate_codes_to_agenciamentos();