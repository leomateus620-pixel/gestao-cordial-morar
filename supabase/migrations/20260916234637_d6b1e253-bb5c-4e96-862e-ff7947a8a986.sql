-- lovable-cron-fallback-reviewed: 1440 runs/day; per-minute agenda reminder dispatch already existed and is required for 1-hour-before precision
INSERT INTO public.app_settings (key, value)
VALUES ('agenda_hook_token', to_jsonb(gen_random_uuid()::text))
ON CONFLICT (key) DO NOTHING;

SELECT cron.unschedule('agenda-reminders-dispatch');

SELECT cron.schedule(
  'agenda-reminders-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/agenda-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7',
      'x-api-key', (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'agenda_hook_token')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('agenda-photo-digest');

SELECT cron.schedule(
  'agenda-photo-digest',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/agenda-photo-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7',
      'x-api-key', (SELECT value #>> '{}' FROM public.app_settings WHERE key = 'agenda_hook_token')
    ),
    body := '{}'::jsonb
  );
  $$
);