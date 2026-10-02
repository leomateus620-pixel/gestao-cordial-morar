- Rotinas automáticas (gatilhos/crons → /api/public/hooks/*) autenticam com `public.internal_worker_headers()` (credencial no cofre); nunca chave pública — why: evita 401 silencioso e segredo em texto.

- Arquivamento de imóvel: pedido, conclusão e reativação passam pelas RPCs property_retire_request / property_archive_finalize / property_unarchive (só service_role); um destino só conta como retirado quando confirmado na intenção de arquivamento (`archive_intent_revision`) — why: enabled=false não comprova retirada e evita concluir cedo demais.

- NFS-e: só o servidor grava em rental_nfse_emissions e registra cada transição em rental_nfse_emission_events (linha `processando` antes do envio, identificador determinístico, nunca reenvio automático de nota real; `incerto` só por incerteza de transporte/corpo; liberação manual só por `nao_emitida` com motivo) — why: evita nota duplicada, sem registro ou competência travada.
