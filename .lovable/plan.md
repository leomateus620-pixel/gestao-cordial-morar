## Objetivo

Cada usuário conecta sua própria conta Google. Ao criar/editar/cancelar/concluir um compromisso na Agenda, o sistema sincroniza (push) com a agenda Google do **responsável principal** do evento, usando os lembretes já configurados como `reminders.overrides` nativos do Google. Notificações no sino do app avisam quando algo falha ou precisa de reconexão.

## Pré-requisito do usuário (configuração única, fora do código)

Para per-user OAuth o Google exige que **você** crie credenciais no Google Cloud Console (não dá para usar o connector nesse modo). Vou te guiar passo a passo na hora:

1. Criar projeto no Google Cloud Console
2. Ativar a **Google Calendar API**
3. Configurar a **OAuth consent screen** (tipo Externo) com escopos `userinfo.email`, `userinfo.profile`, `https://www.googleapis.com/auth/calendar.events`
4. Criar credenciais **OAuth Client ID** (Web application) com a **Authorized redirect URI** apontando para um endpoint do nosso sistema: `https://<seu-dominio>/api/public/google-calendar/callback`
5. Copiar **Client ID** e **Client Secret** → eu peço como secrets do projeto

Depois eu armazeno os tokens de cada usuário no banco e cuido do refresh automaticamente.

## Escopo desta entrega

- Conectar/desconectar a conta Google nas Configurações
- Push de eventos para o Google (criar, atualizar, cancelar, concluir)
- Lembretes nativos do Google (popup/email) a partir do array `lembretes` do compromisso
- Status de sincronização visível em cada evento (badge + ação "Tentar novamente")
- Notificações no sino: token expirado / falha de sync / conta desconectada
- Refresh automático de access token

**Fora de escopo (por opção):** sincronização bidirecional, convites a participantes por e-mail, criação automática de Google Meet, sincronização retroativa em massa de eventos antigos (faço sob demanda quando o evento for editado).

## Detalhes técnicos

### 1. Secrets (peço pelo `add_secret`)
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

### 2. Migração de banco
- Tabela `google_calendar_connections`: `user_id` (PK, FK auth.users), `google_email`, `access_token` (text), `refresh_token` (text), `expires_at` (timestamptz), `scope`, `calendar_id` (default `'primary'`), `last_error`, `created_at`, `updated_at`
  - RLS: usuário só lê/deleta a própria linha; `service_role` faz tudo. Tokens nunca trafegam ao cliente (server-only).
  - GRANT `SELECT, DELETE` para `authenticated` (insert/update só pelo backend via service role).
- Colunas novas em `agenda_events`: `google_event_id text`, `google_calendar_sync_error text`, `google_synced_at timestamptz`. (O enum `google_calendar_sync_status` já existe.)
- Tabela `notifications` (se ainda não houver no projeto, criar mínima): `id, user_id, tipo, titulo, mensagem, lida, created_at` com RLS por `auth.uid()`. *(Vou verificar se já existe antes de criar.)*

### 3. Server routes (raw HTTP, fora de auth)
- `GET /api/public/google-calendar/start` — gera state HMAC + redireciona para o consent URL do Google (`access_type=offline`, `prompt=consent`).
- `GET /api/public/google-calendar/callback` — recebe `code`, troca por tokens, busca e-mail (`userinfo`), faz upsert em `google_calendar_connections` para o `user_id` que veio no `state` assinado. Redireciona para `/configuracoes?google=connected`.

### 4. Server functions (`src/lib/google-calendar/*.functions.ts` + `*.server.ts`)
- `getMyGoogleConnection()` → status (conectado, e-mail, último erro) — sem tokens.
- `disconnectGoogleCalendar()` → revoga token no Google e apaga linha.
- `syncEventToGoogle({ eventId })` — server-only:
  - Carrega o evento + lembretes; resolve `owner_user_id` (responsável) e busca a conexão Google **dele** (via `supabaseAdmin`).
  - Se sem conexão, marca `google_calendar_sync_status = 'nao_sincronizado'` (silencioso).
  - Refresh do access_token se `expires_at` passou.
  - Monta payload: `summary=titulo`, `description=descricao+observacoes+link cliente/imóvel`, `start/end` com timezone `America/Sao_Paulo`, `location`, `reminders.overrides` a partir de `agenda_event_reminders` ativos (tipo `interno`/`email` → `popup`/`email`).
  - Se `google_event_id` existir → `PATCH`; senão → `POST` e salva o id.
  - Em cancelamento/soft-delete → `DELETE` do evento no Google.
  - Em sucesso: `google_calendar_sync_status='sincronizado'`, `google_synced_at=now()`, limpa erro.
  - Em falha: status `'preparado'` (para retry), grava erro e cria notificação no sino. Em 401 com refresh inválido: marca conexão `last_error` e notifica "Reconecte sua conta Google".

### 5. Disparo da sincronização
- Em `upsertAgendaEvent`: após persistir, dispara `syncEventToGoogle` (await, mas não bloqueia em caso de erro — retorna o evento com status do sync).
- Em `softDeleteAgendaEvent` e `completeAgendaEvent`: idem (delete no Google em soft-delete; patch de status em conclusão).
- Botão "Sincronizar agora" em cada card/linha do evento quando status ≠ sincronizado.

### 6. UI
- **Configurações → Integrações** (novo card "Google Agenda"):
  - Estado desconectado: botão "Conectar Google Agenda" → abre `/api/public/google-calendar/start` em nova aba.
  - Estado conectado: mostra e-mail Google, botão "Desconectar", último erro se houver.
- **Card de evento** (`AgendaEventCard`): badge pequeno de sync (✓ sincronizado / ⏳ pendente / ⚠ erro com tooltip).
- **Sino de notificações**: consome `notifications` filtradas por `user_id`.

### 7. Segurança
- Tokens só no servidor (`supabaseAdmin` dentro de handlers, nunca import top-level em `.functions.ts`).
- `state` do OAuth assinado com HMAC usando `SUPABASE_SERVICE_ROLE_KEY` para evitar CSRF e amarrar callback ao `user_id`.
- O callback exige usuário autenticado (cookie/sessão Supabase) e valida que o `state.userId` bate.
- Revogação real no Google ao desconectar (`https://oauth2.googleapis.com/revoke`).

### 8. Validação
- Conectar conta → criar evento → conferir no Google Calendar do usuário.
- Editar horário/título → conferir patch.
- Cancelar → some do Google.
- Forçar token expirado → refresh transparente.
- Revogar acesso no Google → próxima sync gera notificação no sino com CTA "Reconectar".
- RLS: usuário B não vê/edita a conexão de A.

## Ordem de execução

1. Pedir os 2 secrets do Google OAuth.
2. Rodar migração (tabela de conexões + colunas em `agenda_events` + tabela de notificações se faltar).
3. Implementar OAuth (start + callback + connection service).
4. Implementar `syncEventToGoogle` + integrar nas mutations existentes.
5. UI em Configurações + badges nos cards + sino.
6. Testar fluxo completo end-to-end.
