select cron.schedule(
  'property-image-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/property-image-worker',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7"}'::jsonb,
    body := '{"limit": 5}'::jsonb
  ) as request_id;
  $$
);