## Objective

Unify `Clientes` into `Atendimentos` as the single CRM workspace, using the pipeline stages and `attendance_history` foundation already deployed. Rebuild the list into a stage-based Kanban (desktop) / stage list (mobile), add a full CRM detail drawer, and retire the `Clientes` nav entries while keeping `/clientes/*` routes as safe redirects.

## Scope (routes & components)

Edited
- `src/routes/_app.atendimentos.tsx` — orchestrator: dual view (funnel/list), detail drawer wiring, action handlers.
- `src/hooks/useAttendances.ts` — group by `pipelineStage`, replace convert flow with client-linking via `findClientByContact`, expose `moveStage`, `linkClient`, `addNote`.
- `src/components/atendimentos/AtendimentoCard.tsx` — compact card for Kanban columns; keep primary actions; add "Abrir CRM".
- `src/components/shared/module-menu.ts` — remove Clientes entries (all `primaryFor` + secondary).
- `src/components/sidebar-menu.tsx` and mobile bottom nav derivatives — auto-updated via `moduleItems`.
- `src/lib/mock/permissions.ts` — remove `clientes` module from role maps; keep enum for back-compat mapping.
- `src/components/atendimentos/AtendimentoFormModal.tsx` — extend with the fields merged from Clientes (restrictions, profession, income, complete profile, linked property, next action & follow-up); auto client-linking on save.
- `src/services/atendimentos.ts` — group-by-stage helper + stage labels/ordering.

Created
- `src/components/atendimentos/AtendimentoKanban.tsx` — desktop Kanban board (5 columns, drag-and-drop via `@dnd-kit/core` if already present, else button-based stage move).
- `src/components/atendimentos/AtendimentoStageList.tsx` — mobile accordion by stage (collapsible sections, no horizontal scroll).
- `src/components/atendimentos/AtendimentoDetailDrawer.tsx` — full CRM detail: client + attendance + interests + visits + proposals + contracts + next action + structured `attendance_history` timeline + note composer.
- `src/components/atendimentos/AtendimentoHistoryTimeline.tsx` — renders events from `listAttendanceHistory`, typed per `event_type`.
- `src/hooks/useAttendanceDetail.ts` — fetches attendance + history + related agenda events + linked client + sales/rentals hints.
- `src/routes/_app.clientes.tsx` and `src/routes/_app.clientes.$clienteId.tsx` — replaced by `beforeLoad` redirects to `/atendimentos` (list) and `/atendimentos?clientId=…` (detail). Files kept; old imports left to die naturally.

## Kanban / list behavior

- Desktop (`lg+`): 5 fixed columns in a horizontally scrollable row (`overflow-x-auto`, min column width 300px, `snap-x`). Not compressed on tablet; below `lg` the mobile list is used.
- Mobile: `AtendimentoStageList` — accordion with one section per stage, count badges, "primeiro contato" open by default.
- Stage change: drag-and-drop on desktop when `@dnd-kit` is available; otherwise a stage-select popover on each card. Every move calls `updateAttendance({ patch: { pipelineStage } })`; the DB trigger writes `stage_change` into `attendance_history` automatically.
- Filtering, agency (Cordial/Morar) scope, and search apply to both views identically.

## CRM detail drawer

Opens via `?id=<attendanceId>` (existing search param) and from card. Sections:
1. Header — client name, stage pill, priority, broker, quick actions (edit, add note, mark lost, transform contract).
2. Client data — full name, phone/email, contact preference, document, profession, income, restrictions.
3. Commercial interest — purpose, property type, dormitórios, neighborhood, budget range, imóvel code / description.
4. Broker & assignment.
5. Next action + follow-up date.
6. Visits (linked Agenda events for `atendimentoId`).
7. Proposals / contracts (linked sales & rentals — read-only summary + link).
8. Structured history timeline (from `attendance_history`, most recent first) + note composer using `addAttendanceNote`.

Every user-driven mutation in the drawer routes through existing hooks; the DB trigger `attendances_log_history` produces the correlated history events.

## Client-linking (replace "converter em cliente")

- On new attendance save and on edit, call `findClientByContact({ phone, email, document })` server-side; if match → link (`clienteId`, `clienteConvertidoId`) instead of creating. If no match → create client + link. No duplicate client rows.
- `AtendimentoCard` action "Transformar em cliente" is replaced by "Vincular / criar ficha do cliente" using the same helper.

## Nav & redirect changes

Old → New
- Sidebar item "Clientes" → removed. `Atendimentos` is now labeled "Atendimentos & Clientes" (keeps existing icon).
- Bottom nav "Clientes" (corretor, secretaria) → replaced by "Atendimentos" for those profiles (already present for admin).
- `/clientes` → 302 to `/atendimentos`.
- `/clientes/$clienteId` → 302 to `/atendimentos?clientId=<id>`; the route resolves the attendance for that client and opens the detail drawer.
- Any `<Link to="/clientes/...">` inside code (e.g. notifications, quick actions) updated to the new target in the same batch.

## Backfill & validation

- Confirm `attendances.pipeline_stage` is populated for all 17 rows (already backfilled via migration mapping `statusToPipelineStage`). Run a read query to verify `count(*) filter (where pipeline_stage is null) = 0` and print per-stage counts before enabling the UI.
- Verify `attendance_history` has one `criacao` row per existing attendance (backfill migration inserted these); if any missing, insert catch-up rows keyed on `created_at`.

## Permissions & tenant isolation (unchanged behavior)

- `attendances` RLS already scopes to creator / assigned broker / admin / secretaria — no change.
- `clients` RLS unchanged; drawer reads client via existing `getClient` server fn which respects those policies.
- Cordial/Morar filter continues via existing `atendimentoMatchesAgency` on the client side + brand column server side.

## Cross-module preservation

- Agenda: visit creation flow untouched (`AtendimentoActionsDialog` → `upsertAgendaEvent`); drawer surfaces those events read-only.
- Notifications: `notify_atendimento_corretor` and `mark_attendance_opened` triggers already fire — no schema change.
- Contracts/Sales/Rentals: drawer displays references but writes stay in their own modules.

## Verification checklist

- Playwright authenticated flows (admin, corretor, secretaria) at 375, 768, 1440 widths — screenshots of Kanban, list, drawer, and each stage transition; captured under `/tmp/browser/crm/`.
- `supabase--read_query` snapshots: pipeline_stage distribution, history event counts before/after a test stage move, `/clientes` redirect resolution.
- `tsgo` typecheck, `bunx vitest run` (existing rental mapper test), Vite build.
- Verify no `Link to="/clientes"` remain in the source (`rg`).

## Deliverables at the end of implementation

- Routes/components changed (file list).
- Nav diff table (old → new).
- Stage mapping validation (query result).
- History validation (query result + one screenshot of timeline).
- Permission validation (login as each role, list of visible modules).
- Responsive evidence (three screenshots per view × role).
- Typecheck, test, build output tail.

## Out of scope

- Deleting the `clients` table or client CRUD server fns (kept as datastore for the merged profile).
- Editing `src/integrations/supabase/*` auto-gen files.
- Introducing mock or seed data.
