CREATE OR REPLACE FUNCTION public.list_assignable_brokers(_agency text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, agencies text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _agency IS NOT NULL AND _agency NOT IN ('cordial', 'morar', 'ambas') THEN
    RAISE EXCEPTION 'invalid agency' USING ERRCODE = '22023';
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'secretaria'::public.app_role) THEN
    RETURN QUERY
    SELECT
      p.id,
      p.nome,
      array_agg(DISTINCT target_agency.agency ORDER BY target_agency.agency) AS agencies
    FROM public.profiles p
    JOIN public.user_agencies target_agency ON target_agency.user_id = p.id
    JOIN public.user_agencies caller_agency
      ON caller_agency.agency = target_agency.agency
     AND caller_agency.user_id = auth.uid()
    WHERE (
        public.has_role(p.id, 'corretor'::public.app_role)
        OR public.has_role(p.id, 'admin'::public.app_role)
      )
      AND (_agency IS NULL OR _agency = 'ambas' OR target_agency.agency = _agency)
    GROUP BY p.id, p.nome
    ORDER BY p.nome;
    RETURN;
  END IF;

  -- Corretores só podem se autovincular: retorna apenas o próprio registro.
  IF public.has_role(auth.uid(), 'corretor'::public.app_role) THEN
    RETURN QUERY
    SELECT
      p.id,
      p.nome,
      array_agg(DISTINCT ua.agency ORDER BY ua.agency) AS agencies
    FROM public.profiles p
    JOIN public.user_agencies ua ON ua.user_id = p.id
    WHERE p.id = auth.uid()
      AND (_agency IS NULL OR _agency = 'ambas' OR ua.agency = _agency)
    GROUP BY p.id, p.nome;
    RETURN;
  END IF;

  RETURN;
END
$function$;

CREATE OR REPLACE FUNCTION public.enforce_attendance_assignment_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target UUID;
  v_self BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.corretor_id IS NOT DISTINCT FROM OLD.corretor_id
     AND NEW.imobiliaria IS NOT DISTINCT FROM OLD.imobiliaria THEN
    RETURN NEW;
  END IF;
  v_target := public._try_uuid(NEW.corretor_id);
  IF TG_OP = 'INSERT' AND v_target IS NULL THEN RETURN NEW; END IF;

  v_self := auth.uid() IS NOT NULL AND v_target IS NOT NULL AND v_target = auth.uid();

  IF auth.uid() IS NOT NULL AND NOT v_self AND NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'only management can assign an attendance'
      USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.has_notification_agency_access(auth.uid(), NEW.imobiliaria) THEN
    RAISE EXCEPTION 'assignment actor is outside the attendance agency scope'
      USING ERRCODE = '42501';
  END IF;
  IF v_target IS NULL THEN RETURN NEW; END IF;
  IF NOT (
    public.has_role(v_target, 'corretor'::public.app_role)
    OR public.has_role(v_target, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'attendance target is not an active broker'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.has_notification_agency_access(v_target, NEW.imobiliaria) THEN
    RAISE EXCEPTION 'broker is outside the attendance agency scope'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;