## Goal

Make the Agenda > Novo compromisso modal faster and fully backed by real data, keeping auth, RLS, routes and the working reminder/Google sync rules intact.

## What changes

### Step 2 — Data e horário
- Remove "Dia inteiro", "Duração (min)" and "Repetição" from the form.
- Keep: Data, Hora início, Hora fim, Status, Prioridade.
- End time must be after start time, validated inline under the field (no alerts). Duration keeps being derived on the server from start/end, so existing data and lists stay correct.

### Step 3 — Vínculos comerciais
- Replace the current attendance dropdown (which reads a local store) with a real backend query:
  - Broker: attendances where he is creator or assigned broker.
  - Admin/secretária: all attendances inside their agency scope (existing RLS already enforces this — no new exposure).
- Selector gets: search box, loading, empty, error and selected states, showing client name, track/type, date and responsible broker so records are distinguishable.
- Remove the mock "Imóvel vinculado" dropdown. Replace with three real inputs saved with the event:
  - Nome/referência do imóvel
  - Endereço/localização
  - Descrição curta
- Remove the "Link de videochamada" field.

### Step 4 — Responsáveis
- "Responsável principal" is preselected from the authenticated session and shown read-only when creating (editing keeps existing behavior/permissions).
- Additional participants and permission rules unchanged.

### Steps 5 and 6
- Step 5 (convidados externos) unchanged.
- Step 6 becomes only the final checklist (add, mark done, remove, persist). Reminder toggles, e-mail/WhatsApp options and the sync banner are removed from the UI. The automatic reminders (1 day / 1 hour / 30 min) continue to be created by the database, so the existing reminder notifications keep working.

### Google Calendar audit
Verify and fix as needed across the sync path:
- Event goes to the connected Google account of each involved user (owner, creator, participants), tokens resolved per user, never shared.
- Guests get invitations when present; title, description, location, linked context, start/end and timezone (America/Sao_Paulo) sent correctly.
- Updates patch the existing Google event and cancellations delete it — no duplicates, retries idempotent via the per-user sync record.
- Google failures never block saving; status and readable error are stored and surfaced in the UI.

### UI/UX
Tighter modal: compact step navigation, less explanatory text and vertical padding, clearer typography/contrast, grouped fields, sticky footer that doesn't cover content, better dropdown/search/empty/validation/focus states, keyboard navigation, smooth scrolling, and responsive layout for mobile, tablet and desktop.

## Technical notes

- Database migration: add `imovel_nome` and `imovel_endereco` to `agenda_events` (description reuses `imovel_descricao`); no policy changes.
- New server function `listAttendanceOptions` in the agenda/attendances function modules, using `requireSupabaseAuth` so RLS scopes rows; consumed with TanStack Query (loading/error/empty handled by the selector).
- `AgendaFormModal.tsx` is refactored step by step; `AgendaEventInput`/mapper/`upsertAgendaEvent` updated for the new fields and for dropping `videoCallUrl`, `diaInteiro`, `repeticao`, `duracaoMin` from the form path (columns stay, defaults applied server-side).
- Google Calendar changes stay inside `src/lib/google-calendar/google.server.ts` (payload, sendUpdates, error persistence) plus surfacing `google_calendar_sync_error` in the agenda UI.

## Validation

Typecheck, unit tests, and a browser pass on the authenticated preview: create an event, reload to confirm persistence, link an attendance, check checklist persistence, edit and cancel to confirm no duplicate Google events, and confirm sync errors are displayed instead of blocking the save.
