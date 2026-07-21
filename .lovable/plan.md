
## Diagnóstico (verificado)

- Os dois eventos citados existem em `agenda_events`:
  - `Apto jardim primavera` — 20/07 (passado)
  - `Casa Cod 1187` — 23/07 (futuro)
- A tabela `agenda_event_reminders` só possui **1 registro** (30 min, tipo `interno`) para o evento de 23/07. O de 20/07 não tem nenhum lembrete salvo.
- Não existe nenhum dispatcher/cron que leia `agenda_event_reminders` e entregue notificações. Hoje esses registros só viram `reminders.overrides` no payload enviado ao Google Calendar (pop-up nativo do Google), **nada é entregue dentro do sistema nem por e-mail**. Cron ativos atualmente: apenas `financeiro-sheets-autosync`.
- Conclusão: nenhuma notificação foi entregue porque nunca houve infraestrutura para isso — não é falha pontual, é ausência do fluxo. Vamos reaproveitar o fluxo que **está** funcionando (tabela `notifications` + realtime + `/lovable/email/transactional/send`, mesmo caminho do `broker-assignment`).

## Objetivo

Para todo evento da Agenda, entregar automaticamente **3 lembretes** ao responsável (owner + participantes):
- **1 dia antes** (1440 min)
- **1 hora antes** (60 min)
- **30 minutos antes** (30 min)

Cada lembrete cria uma notificação in-app (aparece na central + toast realtime + spotlight) e dispara um e-mail transacional. Cada disparo é único por `(evento, offset)`.

## Mudanças

### 1. Banco (migração)

- `INSERT` de 3 linhas padrão em `agenda_event_reminders` (tipo `interno`, offsets 1440/60/30, ativo) sempre que um evento é criado — via trigger `AFTER INSERT` em `agenda_events`. Backfill idêntico para eventos futuros existentes que ainda não tenham essas 3 linhas.
- Nova tabela `public.agenda_reminder_deliveries` para idempotência:
  - `event_id uuid`, `offset_min int`, `user_id uuid`, `delivered_at timestamptz`
  - PK composta `(event_id, offset_min, user_id)`
  - RLS: `SELECT` para admins/secretaria; `INSERT/UPDATE/DELETE` apenas `service_role`
  - GRANTs padrão + `service_role` full.
- Função RPC `public.agenda_dispatch_reminders()` (SECURITY DEFINER) usada pelo cron para lock leve e ping HTTP no endpoint (mesmo padrão do `email_queue_dispatch`).

### 2. Endpoint dispatcher

`src/routes/api/public/hooks/agenda-reminders.ts` (auth por `apikey` = anon):
- Janela: eventos com `inicio` entre `now()` e `now() + 25h` cujos lembretes em `agenda_event_reminders` (ativos) satisfaçam `inicio - antecedencia_min BETWEEN now() - 6min AND now() + 1min`.
- Para cada (evento, offset, destinatário = owner + participantes + created_by):
  - Se já existir row em `agenda_reminder_deliveries` → pula.
  - Insere `notifications` (tipo `agenda_lembrete`, título "Lembrete: {título} em {N}", link `/agenda?id=...`, `metadata` com offset/inicio).
  - Chama `/lovable/email/transactional/send` com template `agenda-reminder` e `idempotencyKey = agenda:{event_id}:{user_id}:{offset}` (só se o usuário tiver e-mail).
  - Grava `agenda_reminder_deliveries`.

### 3. E-mail

- Novo template `src/lib/email-templates/agenda-reminder.tsx` (mesma estética do `broker-assignment`) com título do evento, data/hora formatada em pt-BR, local, cliente/imóvel vinculados, tempo restante e link.
- Registrado em `src/lib/email-templates/registry.ts`.

### 4. Cron

Job pg_cron `agenda-reminders-dispatch` a cada **1 minuto**, POST no endpoint com header `apikey: <SUPABASE_PUBLISHABLE_KEY>`, corpo `{}`. Inserido via `supabase--insert` (contém URL e apikey do projeto — não vai em migração).

### 5. Front-end (mínimo)

- `AgendaFormModal.tsx`: quando `lembreteAtivo` está ligado, garantir que os 3 offsets padrão sejam persistidos (além do personalizado escolhido pelo usuário, se houver). Mantém o comportamento existente do Google Calendar (não altera overrides).
- Nenhuma alteração de UI adicional — as notificações usam a central de notificações já existente (`useRealtimeNotifications` + `NotificationsSpotlight`).

## Detalhes técnicos

- Segurança: endpoint é `/api/public/*`, mas exige header `apikey` idêntico ao anon key; sem apikey retorna 401. RLS bloqueia leitura/gravação direta em `agenda_reminder_deliveries` para clientes.
- Idempotência tripla: PK em `deliveries` + `email_logs.status='sent'` + `idempotencyKey` na fila de e-mail.
- Timezone: comparação toda em UTC (`agenda_events.inicio` já é `timestamptz`).
- Performance: index em `agenda_events(inicio) WHERE deleted_at IS NULL` + index em `agenda_event_reminders(event_id, ativo)`.
- Reaproveita 100% o fluxo existente (`enqueue_email` → `pgmq` → processador → provedor Lovable Emails).

## Validação

1. Backfill cria as 3 linhas de lembrete para o evento futuro `Casa Cod 1187` (23/07).
2. Invocar o endpoint manualmente com `stack_modern--invoke-server-function` simulando cada offset (via SQL update temporário no `inicio` de um evento de teste, ou usando janela alargada) e confirmar:
   - linha em `notifications` para o owner,
   - linha em `agenda_reminder_deliveries`,
   - linha `sent` em `email_logs`,
   - segunda execução no mesmo minuto **não** duplica.
3. Confirmar que o cron `agenda-reminders-dispatch` aparece em `cron.job` e que `cron.job_run_details` mostra sucessos.
