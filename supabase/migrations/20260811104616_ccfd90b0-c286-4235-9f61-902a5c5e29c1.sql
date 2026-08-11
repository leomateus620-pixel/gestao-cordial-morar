ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET is_internal = true WHERE id = 'd3abe478-5f0f-480e-b2d5-d9c9762bd8c4';

CREATE OR REPLACE FUNCTION public.list_corretores()
 RETURNS TABLE(id uuid, nome text, email text, iniciais text, cargo text, role app_role)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nome, p.email, p.iniciais, p.cargo, ur.role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('corretor'::public.app_role, 'admin'::public.app_role)
    AND auth.uid() IS NOT NULL
    AND (p.is_internal = false OR p.id = auth.uid())
  ORDER BY p.nome;
$function$;

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
      AND (p.is_internal = false OR p.id = auth.uid())
      AND (_agency IS NULL OR _agency = 'ambas' OR target_agency.agency = _agency)
    GROUP BY p.id, p.nome
    ORDER BY p.nome;
    RETURN;
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_corretores_response_metrics(_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _end timestamp with time zone DEFAULT NULL::timestamp with time zone, _imobiliaria text DEFAULT NULL::text)
 RETURNS TABLE(broker_id uuid, broker_nome text, avg_seconds numeric, median_seconds numeric, fastest_seconds integer, slowest_seconds integer, completed_count bigint, pending_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.broker_id,
    max(p.nome) AS broker_nome,
    avg(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    )::NUMERIC AS avg_seconds,
    (
      percentile_cont(0.5) WITHIN GROUP (ORDER BY a.response_time_seconds) FILTER (
        WHERE a.status = 'opened'
          AND a.first_opened_by = a.broker_id
          AND a.response_time_seconds IS NOT NULL
      )
    )::NUMERIC AS median_seconds,
    min(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    ) AS fastest_seconds,
    max(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    ) AS slowest_seconds,
    count(*) FILTER (
      WHERE a.status = 'opened'
        AND a.first_opened_by = a.broker_id
        AND a.response_time_seconds IS NOT NULL
    ) AS completed_count,
    count(*) FILTER (WHERE a.status = 'pending_open') AS pending_count
  FROM public.attendance_assignments a
  LEFT JOIN public.profiles p ON p.id = a.broker_id
  WHERE (_start IS NULL OR a.assigned_at >= _start)
    AND (_end IS NULL OR a.assigned_at < _end)
    AND (_imobiliaria IS NULL OR a.imobiliaria = _imobiliaria)
    AND coalesce(p.is_internal, false) = false
    AND public.has_notification_agency_access(auth.uid(), a.imobiliaria)
  GROUP BY a.broker_id
  ORDER BY avg_seconds NULLS LAST;
END
$function$;