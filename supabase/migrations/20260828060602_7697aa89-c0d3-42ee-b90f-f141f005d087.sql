select cron.schedule(
  'property-drive-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/property-drive-worker',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7"}'::jsonb,
    body := '{"limit": 2}'::jsonb
  ) as request_id;
  $$
);