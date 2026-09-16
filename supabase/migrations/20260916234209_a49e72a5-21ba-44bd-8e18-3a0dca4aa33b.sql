SELECT cron.schedule(
  'agenda-photo-digest',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/agenda-photo-digest',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);