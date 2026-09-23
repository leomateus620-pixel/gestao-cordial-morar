-- Retomada: tarefas de fotos que falharam só por falta dos ajustes de banco
-- voltam à fila escalonadas (1 por minuto por conta), sem gastar tentativa.
WITH ranked AS (
  SELECT id, provider, row_number() OVER (PARTITION BY provider ORDER BY created_at) rn
    FROM public.property_sync_jobs
   WHERE status = 'retry' AND action = 'media_sync'
     AND (last_error_message ILIKE '%desired_destination_hash does not exist%'
       OR last_error_message ILIKE '%desired_availability does not exist%')
)
UPDATE public.property_sync_jobs j
   SET status = 'pending',
       next_run_at = now() + make_interval(mins => (r.rn - 1)::int),
       attempts = GREATEST(0, j.attempts - 1),
       last_error_message = 'Retomada após ajuste de banco (23/09).'
  FROM ranked r WHERE r.id = j.id;