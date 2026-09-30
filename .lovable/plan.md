# Push na hora do evento: disparo imediato, sem rajadas, com horário e atraso visível

Escopo: código + migrações aditivas. Nenhum UPDATE/DELETE em dados existentes; a fila atual (0 pendentes) não é reprocessada em massa.

## Confirmado na leitura de hoje

- `notifications_enqueue_push`: insere em `push_outbox` e chama `push-worker` com `apikey` = chave pública, dentro de `EXCEPTION WHEN OTHERS THEN NULL`. O worker só aceita `NOTIFICATION_HOOK_SECRET` / `WORKER_HOOK_SECRET` / `PROPERTY_SYNC_WORKER_SECRET`, então recusa a chamada.
- `cron.job` não tem nenhuma rotina do push-worker. As rotinas `agenda-reminders-dispatch` (a cada minuto) e `agenda-photo-digest` (11:00 UTC) existem.
- A última notificação `agenda_lembrete`/`agenda_fotos` é de **21/09 18:29 UTC**. Isso confirma que elas pararam na mesma época. Essas rotas aceitam `NOTIFICATION_HOOK_SECRET` ou `app_settings.agenda_hook_token`. O passo 1 confere qual credencial o cron envia (provavelmente a chave pública) e se a resposta é 401. O histórico de respostas guarda só cerca de 2 dias, então a prova será uma chamada de teste depois da troca.
- `push_outbox` hoje tem: `status, attempts, last_error, created_at, processed_at, claimed_at`. Não tem horário do evento, próxima tentativa nem motivo estruturado.
- Tipos que existem em `notifications`: `atendimento_iniciado` (420), `atendimento_atribuido` (152), `agenciamento_bonificacao` (40), `agenda_fotos` (31), `system` (13), `agenda_lembrete` (8), `google_calendar` (7). Há também `venda_vencimento`, criado por `sale-payment-reminders`, mas essa rotina não tem cron. **Não existe push de "venda realizada".**

## 1. Credencial segura para as rotinas automáticas

- Guardar o segredo de servidor (`WORKER_HOOK_SECRET`) no cofre do banco (vault), com o nome `worker_hook_secret`. Uma função `SECURITY DEFINER` `internal_worker_headers()` monta o cabeçalho lendo do cofre. Nada fica em texto puro nas funções nem nos crons.
- Refazer os crons `agenda-reminders-dispatch` e `agenda-photo-digest` com `internal_worker_headers()`. Conferir e ajustar também os outros crons de worker que usem a chave pública, porque a regra de 22/09 vale para todos.
- As rotas de agenda passam a aceitar `workerSecrets()`, além das credenciais atuais.

## 2. Disparo pelo evento

- Nova versão de `notifications_enqueue_push`:
  - grava a linha com `event_at` (horário do evento, vindo da notificação) e `queued_at`;
  - chama o worker com `internal_worker_headers()` e `{ notification_id }` para enviar só aquela notificação, não um lote;
  - em caso de erro, não engole mais em silêncio: grava `last_error` e `last_error_at` na linha e mantém o status `pending` para o retry. O insert da notificação nunca falha por causa do push.
- Worker: novo modo de envio de um único item. Ele reivindica só aquela linha, por uma RPC atômica `push_outbox_claim_one`.
- Fallback: cron `push-outbox-retry` a cada minuto. Ele reprocessa `pending`/`failed` com `next_attempt_at <= now()`. A espera cresce 1, 2, 4 e 8 min, com no máximo 5 tentativas; depois disso a linha vira `failed_final`. Custo: são 1.440 execuções por dia. É uma consulta leve, mas mantém o banco ativo o tempo todo. O cron é necessário porque o requisito é "nunca atrasado", e sem ele uma falha de rede só sairia no próximo evento. O atraso máximo em caso de falha fica em cerca de 1 min.

## 3. Nada de rajada com eventos antigos

Recomendação: **resumo único por usuário**, no lugar de descartar sem aviso.
- Na hora de enviar, se `now() - event_at > 10 min`, a linha vira `expired` e não gera push individual.
- A cada execução do retry, as linhas `expired` ainda não resumidas geram **um** push por usuário. Exemplo: "5 atendimentos iniciados e 2 atribuídos enquanto você estava sem conexão". O toque abre a central de notificações. Depois do resumo, as linhas ficam como `summarized`.
- As notificações continuam na central, dentro do app. Só o push é resumido.
- Publicação: a migração marca como `expired`/`summarized` só as linhas antigas que existirem no momento (hoje 0), sem gerar resumo. Nenhuma rajada.

## 4. Horário do evento no corpo

- `buildPushPresentation` recebe `eventAt` e acrescenta ao corpo "às 15:02" (fuso America/Sao_Paulo). Se o evento não for de hoje, mostra "em 28/09 às 15:02".
- `event_at` vem de `notifications.created_at`. Para lembretes de agenda, vem do horário do próprio compromisso quando fizer sentido. No lembrete, o texto diz "Visita às 15:00", o horário do compromisso.

## 5. Dedup

- Nova coluna `dedup_key` em `push_outbox` = `tipo:entity_id:user_id`, com índice único parcial. `ON CONFLICT DO NOTHING` impede enfileirar duas vezes o mesmo evento para o mesmo usuário.
- Envio: o claim atômico com `FOR UPDATE SKIP LOCKED` troca `pending` por `processing` com `claimed_at`. Um retry só pega linhas em que nenhum dispositivo recebeu. O resultado por token fica registrado (`sent_tokens`), para não reenviar a quem já recebeu.
- Uma linha presa em `processing` há mais de 2 min volta para `pending`, mas não reenvia para os tokens já confirmados.

## 6. Cobertura por tipo

| Tipo | Onde nasce |
|---|---|
| atendimento_iniciado / atendimento_atribuido | gatilhos `notify_atendimento_corretor` / assignments |
| agenciamento_bonificacao | `agenciamento_bonus_notify` |
| agenda_lembrete | rota `agenda-reminders` (cron) |
| agenda_fotos | `agenda-photo-digest` (cron) e `agenda_notify_photo_session` |
| google_calendar | `google.server.ts` |
| system / imobi | `property_create_stuck_alerts`, drive, teste de push |
| venda_vencimento | `sale-payment-reminders` (sem cron hoje) |
| **venda_realizada (novo)** | novo gatilho AFTER INSERT em `real_estate_sales` para os admins: "Venda realizada · {imóvel} · {corretor} às HH:MM" |

- Todos os tipos passam pelo mesmo gatilho de `notifications`, então a correção vale para todos, inclusive tipos futuros.
- `venda_realizada` precisa ser acrescentado em `notification-system.ts` e `push-presentation.ts` (ícone de venda, abre /vendas).
- Pergunta 2 trata do cron de `sale-payment-reminders`.

## 7. Registro e visibilidade do atraso

- Novas colunas aditivas em `push_outbox`: `event_at`, `queued_at`, `sent_at`, `next_attempt_at`, `last_error_at`, `dedup_key`, `sent_tokens`, `summary_id`.
- Novos status: `expired`, `summarized`, `failed_final`.
- RPC admin `get_push_delivery_health()`: pendentes, pendente mais antigo, atraso médio e p95 das últimas 24 h, falhas recentes.
- Novo cartão "Entrega de push" nas Configurações, só para admin, ao lado do diagnóstico de push.
- Alerta: se houver um pendente com mais de 2 min, o cron de retry cria **uma** notificação `system` para os admins, com dedup por janela de 30 min. Ela aparece na central. O push desse alerta segue o mesmo caminho.

## 8. Testes

- `push-worker-auth.test.ts`: cabeçalho vindo do cofre é aceito; chave pública recebe 401.
- `push-expiry.test.ts`: evento com mais de 10 min vira expirado e gera 1 resumo por usuário; nunca N pushes.
- `push-dedup.test.ts`: mesma chave não é enfileirada duas vezes; duas execuções em paralelo enviam uma vez; retry não reenvia a token confirmado.
- `push-presentation.test.ts`: "às 15:02" no fuso de SP; formato para outro dia.
- `push-types.test.ts`: cada tipo, inclusive `venda_realizada`, tem apresentação e link.
- `push-retry-schedule.test.ts`: espera de 1/2/4/8 min, `failed_final` após 5 tentativas.
- `tests/sql/push_outbox.sql`: gatilho grava `event_at`/`dedup_key`; erro na chamada fica registrado; venda nova gera notificação para os admins.
- Validação em produção após publicar: criar um atendimento de teste e medir de `queued_at` a `sent_at` (menos de 10 s). Uma chamada ao cron de agenda deve voltar 200.

## Arquivos afetados

- Migração nova: colunas e status em `push_outbox`, `internal_worker_headers()`, nova `notifications_enqueue_push`, `push_outbox_claim_one`, `push_outbox_retry_due`, `get_push_delivery_health`, gatilho `venda_realizada`, crons refeitos (agenda) e novo `push-outbox-retry`.
- `src/routes/api/public/hooks/push-worker.ts` (envio único, validade, resumo, tokens confirmados)
- `src/lib/push/push-presentation.ts`, `src/lib/notifications/notification-system.ts`
- `src/lib/notifications/hook-auth.server.ts`, `agenda-reminders.ts`, `agenda-photo-digest.ts`
- `src/components/notifications/PushDeliveryHealthCard.tsx` (novo), `src/lib/push/push-diagnostics.functions.ts`
- Testes listados acima.

## Riscos

- Um segredo guardado no cofre diferente do segredo do servidor causa 401 de novo. Por isso a validação pós-publicação e o alerta de 2 min.
- O resumo pode esconder um evento importante. Mitigação: a central continua com todos os itens.
- Cron de 1 min tem custo contínuo (1.440 execuções por dia).
- O gatilho de venda dispara também em vendas importadas em lote. Mitigação: a regra de validade de 10 min se aplica.
- Refazer crons de agenda pode gerar lembretes atrasados. As rotas já filtram pelo horário, mas isso será conferido antes.

## Perguntas em aberto

1. Resumo único por usuário (recomendado) ou descartar sem push os eventos com mais de 10 min?
2. Ligar também o cron de `sale-payment-reminders` (vencimento de parcelas)? Hoje ele não roda.
3. "Venda realizada" vai só para os admins, ou também para o corretor da venda?
4. Validade de 10 min para todos os tipos, ou maior para lembretes de agenda (ex.: 30 min)?
5. Depois de validar, posso publicar ou fica só na prévia?
