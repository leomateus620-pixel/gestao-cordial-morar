-- lovable-cron-fallback-reviewed: 288 runs/day; reenvio automático das fotos recusadas pelos sites exige janela curta de recuperação sem clique do usuário
select cron.unschedule('property-image-retry') where exists (select 1 from cron.job where jobname = 'property-image-retry');

select cron.schedule(
  'property-image-retry',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/property-image-retry',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7"}'::jsonb,
    body := '{"limit": 25, "backfillLimit": 25}'::jsonb
  ) as request_id;
  $$
);