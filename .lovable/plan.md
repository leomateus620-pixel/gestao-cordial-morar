## Diagnóstico

Consultei o banco e o código do sync com Google. Dois problemas explicam por que eventos "não aparecem" na agenda de todos:

1. **Usuários sem conta Google conectada.** O sistema só empurra evento para quem já autorizou. Hoje faltam 3:
   - **Leonardo** (admin), **Felipe** (corretor), **Geandre** (corretor).
   - Bruna, Ricardo, Bianca e Pablo estão conectados e os eventos deles estão marcados como `sincronizado` no banco — para essas contas o fluxo funciona.

2. **O sync só envia para o "responsável principal" (owner) do evento.** Se a Bianca cria um compromisso e coloca a Felipe como responsável, o evento tenta ir só para o Google do Felipe. Ninguém mais (admin, outros participantes) recebe cópia no próprio Google Calendar. Hoje `syncAgendaEventToGoogle` faz um único push para `owner_user_id` e ignora `agenda_event_participants`.

Ou seja, o motor está OK — falta abranger todo mundo que participa do evento e destravar quem ainda não conectou.

## O que farei

### 1. Sync multi-usuário (arquivo `src/lib/google-calendar/google.server.ts`)
- Trocar `syncAgendaEventToGoogle` para enumerar todos os destinatários: `owner_user_id` + `created_by` + cada `agenda_event_participants.user_id`, deduplicados.
- Para cada destinatário conectado, fazer create/patch no próprio calendário. Cada cópia guarda seu próprio `google_event_id` por (evento, usuário).
- Nova tabela `agenda_event_google_syncs (event_id, user_id, google_event_id, last_synced_at, last_error)` para persistir o id retornado por usuário. Substitui a coluna atual `agenda_events.google_event_id` (que só suportava 1 destino). Manter a coluna antiga por compatibilidade (deprecada, sem uso novo).
- Cancelamento/soft-delete: DELETE em cada cópia registrada, depois limpa a linha do sync.
- Attendees do Google: continuar mandando os `agenda_event_guests` (e-mails externos). Adicionar também o e-mail Google de cada participante conectado, para quem quiser aceitar/recusar. Usuários sem conexão Google não viram attendees (o e-mail do profile pode não ser o mesmo do Google e geraria invites em contas erradas).
- Status agregado em `agenda_events.google_calendar_sync_status`: `sincronizado` se pelo menos um destinatário sincronizou; `preparado` se todos falharam; `nao_sincronizado` se nenhum destinatário tem conexão.

### 2. Backfill ao conectar (novo endpoint no `google-calendar.functions.ts`)
- Ao completar OAuth com sucesso no callback (`api/public/google-calendar.callback.ts`), disparar um backfill: para todo evento futuro em que o novo usuário é owner/created_by/participante, chamar o sync uma vez.
- Também expor um botão "Sincronizar meus próximos eventos" no `GoogleCalendarCard`, para quem já está conectado forçar reprocesso após a mudança.

### 3. Comunicação para os 3 não conectados
- No `AgendaEventCard` (ou em cima da timeline da Agenda), mostrar aviso discreto quando o usuário logado ainda não tem `google_calendar_connections`: "Conecte seu Google para receber os compromissos na sua agenda pessoal → Configurações".
- Notificação in-app one-off para Leonardo, Felipe e Geandre pedindo para conectar (usando `notifications`).

### 4. Migração + grants (`supabase--migration`)
- `agenda_event_google_syncs` com RLS: leitura só de admins/secretaria/dono da linha. Grants padrão `authenticated`/`service_role`.
- Índice em `(event_id, user_id)` único.

### 5. Verificação
- Reenviar 1 evento existente (ex.: "Casa Cod 1187") após deploy e conferir:
  - Aparece no Google do Ricardo (owner) — já aparecia.
  - Se eu adicionar Bianca como participante, aparece também no Google dela.
  - Marca `agenda_event_google_syncs` com 2 linhas, uma para cada destino.
- Consultar `agenda_events` para confirmar `sincronizado` agregado.

## Fora de escopo
- Alterar quem é considerado owner/participante do evento (regras atuais permanecem).
- Convidar via Google todos os corretores por e-mail do profile (evitado porque muitos e-mails de profile ≠ e-mail Google e geraria convites em contas erradas).
- Mudar o intervalo do dispatcher de lembretes (segue como está).