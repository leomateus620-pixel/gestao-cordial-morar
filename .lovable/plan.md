
## Objetivo

Testar o envio do lembrete do evento "Casa Cod 1187" (23/07 às 16:00 BRT) para o e-mail de Ricardo (`ricardo@cordialimoveis.com`) e deixar o canal de e-mail funcionando de forma recorrente junto com a notificação in-app.

## Situação atual

- O dispatcher `/api/public/hooks/agenda-reminders` já roda a cada 1 min via `pg_cron` e cria notificações in-app com idempotência por `(evento, offset, usuário, channel='notification')`.
- O template `agenda-reminder` já está registrado.
- **Falta**: o dispatcher ainda não envia e-mail. Nenhum lembrete por e-mail foi entregue.
- Para o evento do dia 23, os 3 lembretes padrão (1 dia / 1 hora / 30 min antes) já estão em `agenda_event_reminders`.

## O que farei

### 1. Adicionar canal de e-mail no dispatcher
Editar `src/routes/api/public/hooks/agenda-reminders.ts`:
- Buscar `profiles.email` de cada destinatário (owner + created_by + participantes).
- Enfileirar e-mail via `supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload })` — mesmo caminho que o resto do app usa (respeita retry, DLQ, suppressed_emails).
- Payload usa `templateName: 'agenda-reminder'` com `templateData` (titulo, inicio, local, cliente, imovel, label de antecedência).
- `idempotencyKey`: `agenda-${eventId}-${offset}-${userId}`.
- Registrar entrega em `agenda_reminder_deliveries` com `channel='email'` (linha separada da notificação in-app) para não duplicar em runs futuras.

### 2. Teste imediato para Ricardo
Depois do deploy, disparar manualmente o envio do lembrete de "1 dia antes" (offset 1440) do evento `bcba4489-...` para o `user_id` do Ricardo:
- Inserir a linha na fila `transactional_emails` via RPC com os dados reais do evento.
- Marcar `agenda_reminder_deliveries` (channel=email) para não reenviar depois.
- Confirmar em `email_send_log` se saiu como `sent`; se ficar `pending`/`dlq`, reportar o motivo.

### 3. Verificação
- Consultar `email_send_log` filtrando pelo `idempotencyKey` do teste.
- Confirmar que futuras execuções do cron não duplicam (idempotência por channel).

## Fora de escopo

- Mudanças no template visual do e-mail (usar o já existente).
- Alterar frequência do cron ou os offsets padrão (1 dia / 1 hora / 30 min já configurados).
