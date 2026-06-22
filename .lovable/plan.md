## Objetivo
Enviar lembretes automáticos por e-mail para cada compromisso da Agenda nos intervalos **1 dia antes, 1 hora antes e 10 minutos antes** do início, marcados como **alta prioridade** na caixa de entrada (cabeçalhos `Importance: High` + `X-Priority: 1`).

## Como vai funcionar

1. **Infra de e-mail Lovable**
   - Verificar domínio de e-mail. Se não existir, abrir o diálogo de setup (passo bloqueante).
   - Rodar `setup_email_infra` (cria filas, cron, tabelas `email_send_log`, `suppressed_emails`, etc.).
   - Rodar `scaffold_transactional_email` (cria rotas `/lovable/email/transactional/send`, preview, unsubscribe, suppression).

2. **Template do lembrete** (`src/lib/email-templates/agenda-reminder.tsx`)
   - React Email com identidade do app (mesma paleta do dashboard).
   - Campos: título do compromisso, quando (`1 dia / 1 hora / 10 minutos`), data/hora formatada (America/Sao_Paulo), tipo, local/link de vídeo, cliente, imóvel, responsável, observações, link para `/agenda`.
   - Subject dinâmico: `⏰ {janela} — {titulo}` (ex.: `⏰ Em 10 minutos — Visita Apto 302`).
   - Registrar em `src/lib/email-templates/registry.ts`.

3. **Agendamento das notificações**
   - Nova tabela `public.agenda_event_notifications` com:
     `event_id`, `recipient_user_id`, `recipient_email`, `window` (`1d` | `1h` | `10m`), `scheduled_for` (timestamptz), `sent_at`, `status` (`pending` | `sent` | `skipped` | `error`), `error`, `idempotency_key` (único: `event_id + recipient + window + inicio_iso`).
   - RLS + GRANTs padrão; índice em `(status, scheduled_for)`.
   - Função `public.schedule_agenda_notifications(_event_id uuid)` (SECURITY DEFINER) que:
     - Lê o evento + responsável + participantes (com e-mail via `auth.users`).
     - Para cada destinatário e cada janela, faz UPSERT em `agenda_event_notifications` com `scheduled_for = inicio - intervalo`.
     - Marca `skipped` quando `scheduled_for < now()` ou evento `cancelado/concluido`.
   - Chamar `schedule_agenda_notifications` dentro de `upsertAgendaEvent`, `softDeleteAgendaEvent` e `completeAgendaEvent` (substituindo/cancelando as pendentes quando o `inicio` muda ou o status sai de ativo).

4. **Worker que envia (cron a cada 1 min)**
   - Rota `src/routes/api/public/hooks/agenda-reminders.ts`:
     - Auth via `apikey` (anon key) — padrão Lovable para `pg_cron`.
     - Seleciona até 200 linhas `pending` com `scheduled_for <= now() + 30s`.
     - Para cada uma, chama `/lovable/email/transactional/send` (service-role interno) com:
       - `templateName: 'agenda-reminder'`
       - `recipientEmail`, `idempotencyKey` (= coluna `idempotency_key`)
       - `templateData` montado a partir do evento atual
       - `headers: { Importance: 'High', 'X-Priority': '1', 'X-MSMail-Priority': 'High' }` (extensão pequena no send route p/ aceitar `headers` opcionais — somente para esse template).
     - Atualiza `status` para `sent` ou `error` + `sent_at`/`error`.
   - `pg_cron` (via `supabase--insert`, não migration): `*/1 * * * *` chamando essa rota.

5. **Prioridade alta no inbox**
   - Cabeçalhos `Importance: High`, `X-Priority: 1 (Highest)`, `X-MSMail-Priority: High` enviados pelo provider.
   - Assunto começa com `⏰` para destaque visual.

6. **UI (mínima, não intrusiva)**
   - No `AgendaEventCard`, badge discreto "Lembretes por e-mail: 1d · 1h · 10min" quando o evento estiver no futuro e tiver destinatários.
   - Nenhum controle novo: as 3 janelas são padrão fixo conforme pedido.

## Detalhes técnicos

- **Destinatários**: responsável principal + participantes com `user_id` válido. E-mails buscados em `auth.users` via função SECURITY DEFINER (não expor lista ao cliente).
- **Reagendamento**: ao editar `inicio`, deletar pendentes (`status='pending'`) e recriar. Eventos `concluido`/`cancelado` cancelam pendentes.
- **Idempotência**: chave inclui `inicio_iso` — se a data muda, gera nova chave e o worker não duplica.
- **Janela de tolerância**: worker pega `<= now() + 30s` para compensar jitter do cron.
- **Logs**: `email_send_log` (Lovable) + `agenda_event_notifications.status` (auditoria por janela).
- **Fuso**: formatação no template usa `America/Sao_Paulo`.

## Pré-requisitos / perguntas
- O domínio de e-mail Lovable **ainda não está configurado** neste projeto. Vou precisar abrir o diálogo de setup antes de implementar os itens 1–4. Confirma que posso seguir por aí (e-mails saindo do seu domínio próprio)?
