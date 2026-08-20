DROP FUNCTION IF EXISTS public.get_corretores_response_metrics(timestamptz, timestamptz, text);

CREATE OR REPLACE FUNCTION public.get_corretores_response_metrics(
  _start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _imobiliaria text DEFAULT NULL::text
)
RETURNS TABLE(
  broker_id uuid,
  broker_nome text,
  avg_seconds numeric,
  median_seconds numeric,
  fastest_seconds integer,
  slowest_seconds integer,
  completed_count bigint,
  pending_count bigint,
  late_count bigint
)
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
    count(*) FILTER (WHERE a.status = 'pending_open') AS pending_count,
    count(*) FILTER (
      WHERE a.status = 'opened'
        AND a.first_opened_by = a.broker_id
        AND a.response_time_seconds > 259200
    ) AS late_count
  FROM public.attendance_assignments a
  LEFT JOIN public.profiles p ON p.id = a.broker_id
  WHERE (_start IS NULL OR a.assigned_at >= _start)
    AND (_end IS NULL OR a.assigned_at < _end)
    AND (_imobiliaria IS NULL OR a.imobiliaria = _imobiliaria)
    AND coalesce(p.is_internal, false) = false
    AND public.has_notification_agency_access(auth.uid(), a.imobiliaria)
  GROUP BY a.broker_id
  ORDER BY median_seconds NULLS LAST;
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_corretores_response_metrics(timestamptz, timestamptz, text) TO authenticated;