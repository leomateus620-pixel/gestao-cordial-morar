# Incidente da fila de publicação — 18/09/2026

## Alvo
Imóvel `95c61ecf-3031-4f90-91c3-ac7aef742907` — Cordial 1381 / Morar 3380.

## Causa confirmada
1. `property_sync_claim_jobs` reivindicava um lote misto (8 jobs de uma vez: `media_sync`,
   `update` e os dois `publish` deste imóvel), todos pelo mesmo worker `worker-c203f396`.
2. `runSyncWorker` processa em sequência; `publish`/`update` ainda aguardavam
   `deliverGallery` (mídia), que pode esperar ~75s por slot do provedor e 90s por upload.
3. O request estourou no primeiro job e os demais — já reivindicados — ficaram `processing`.
4. O lease só era devolvido quando `property_sync_claim_jobs` rodasse de novo; com o cron
   `property-sync-worker` (jobid 281) desativado por segurança, os jobs ficaram órfãos.

## Backup lógico do estado ANTES (18/09/2026, leitura direta do banco)

| job_id | provider | action | status | attempts | locked_by | locked_at | lock_expires_at | requested_revision | correlation_id |
|---|---|---|---|---|---|---|---|---|---|
| aeda034b-1943-445c-a7f4-2f7c93df5b8f | cordial | publish | processing | 1 | worker-c203f396 | 2026-09-18 19:39:33.703646+00 | 2026-09-18 19:42:33.703646+00 | 2 | 15637c9e-b53e-4eef-907c-f0403bb13435 |
| cbf1a349-d167-44e0-933e-f4c36b0e6cf4 | morar | publish | processing | 1 | worker-c203f396 | 2026-09-18 19:39:33.703646+00 | 2026-09-18 19:42:33.703646+00 | 2 | 93c3fcbf-4456-442c-978d-bc68a4b0da32 |

Publicações antes: Cordial e Morar com `enabled=true`, `status=pending`,
`external_property_id=NULL`, `external_reference=GC-95C61ECF3031`, `media_status=NULL`,
sem vínculos remotos gravados. `next_run_at` original: 19:37:34 (cordial) / 19:37:34 (morar).

## Correção aplicada
- `property_sync_reclaim_stale()`: devolve para `retry` todo job `processing` com lease
  expirado. Chamado dentro do claim e por cron a cada 5 minutos (rede de segurança).
- `property_sync_claim_jobs(..., _actions text[])`: claim filtrado por ação.
- Worker cadastral reivindica só ações cadastrais; `media_sync` tem worker próprio
  (`/api/public/hooks/property-media-worker`), 1 job por execução, lease de 600s.
- `processJob` publish/update não aguarda mais a galeria: confirma o cadastro por GET,
  grava `external_property_id`/URL e apenas ENFILEIRA `media_sync`.
- `imobi_update_sync_paused` permanece `true`; `action=update` continua cancelado.
