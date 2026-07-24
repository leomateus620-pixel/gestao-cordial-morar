INSERT INTO public.attendance_history
  (attendance_id, client_id, event_type, actor_id, actor_name, description, new_value, source, created_at)
SELECT
  a.id,
  a.cliente_id,
  'criacao',
  a.created_by,
  COALESCE(p.nome, 'Sistema'),
  'Atendimento criado (backfill).',
  jsonb_build_object('status', a.status, 'pipeline_stage', a.pipeline_stage, 'corretor_id', a.corretor_id),
  'backfill',
  a.created_at
FROM public.attendances a
LEFT JOIN public.profiles p ON p.id = a.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.attendance_history h WHERE h.attendance_id = a.id
);