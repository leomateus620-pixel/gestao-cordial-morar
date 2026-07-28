## What the audit found (verified against the live database)

**Access control is already correct — no RLS rebuild needed.**
- `agenda_can_access(event_id)` allows: creator, `owner_user_id` (primary responsible), participant row, plus `admin`/`secretaria`, all scoped by agency. `agenda_can_edit` is the same minus participants. Policies on `agenda_events` and all four child tables (participants, guests, reminders, checklist) route through those two functions. This matches the requested rules exactly.
- `listAgendaEvents` does no client-side owner filtering — it relies purely on RLS, so the "Todos" tab already shows only what policy allows.

**Real defects found:**

1. **Broken sync for 4 of 7 connected accounts.** Their stored OAuth scope is only `openid/email/profile` — no `calendar.events` (they connected before the scope was added: Felipe, Bianca, Geandre, and one more). Google returns `403 insufficient authentication scopes`; 3 events currently sit in `preparado` with that error. The code only detects `401/invalid_grant` as "reconnect needed", so 403-scope failures never raise a reconnect prompt and never surface in the card.

2. **Obsolete Google events are never removed on unassignment.** `syncAgendaEventToGoogle` loops only over *current* recipients. When a participant is removed or the responsible user is reassigned, the old user's row in `agenda_event_google_syncs` and their Google copy stay behind forever. Same when an event loses all recipients or all connections.

3. **No retry / no background execution.** Sync runs inline in the request with `try/catch → console.error`. A transient Google failure is silently lost; nothing ever retries. `google_calendar_sync_error` is written but never displayed in the UI.

4. **Manual "Sincronizar próximos eventos" button** still exists on the connection card, and reconnect does not explicitly re-run a backfill from the client side.

Recipient resolution itself is already correct and server-side (`created_by` + `owner_user_id` + persisted participants, never the visibility query), and the mapping table already has `UNIQUE (event_id, user_id)`.

## Plan

### 1. Detect and surface invalid scope (fixes the 4 broken accounts)
- In `google.server.ts`, before syncing a connection, check the stored `scope` contains `calendar.events`; if not, skip the Google call, write a clear `last_error` ("Permissão do Google Agenda incompleta — reconecte sua conta") and emit the existing dedup-keyed notification.
- Extend the failure classifier to treat `403 insufficient authentication scopes` / `insufficientPermissions` the same as `401/invalid_grant`.
- Show `last_error` prominently on the connection card with an inline "Reconectar" call to action (the card already renders `last_error`; make it actionable).

### 2. Reconcile obsolete recipients (unassignment / reassignment / participant removal)
- In `syncAgendaEventToGoogle`, after computing `recipientIds`, load **all** existing `agenda_event_google_syncs` rows for the event and compute the set difference. For every stale `user_id`: DELETE the Google event using that row's own `calendar_id`/`google_event_id`, then delete the mapping row.
- Apply the same reconciliation when `recipientIds` is empty or no recipient has a connection (today those paths return early without cleanup).
- Cancellation and soft delete already flow through the same function, so they inherit the cleanup.

### 3. Idempotent, fault-tolerant, background sync
- Add a `agenda_google_sync_queue` table (`event_id` unique, `attempts`, `next_attempt_at`, `last_error`) written by the same server code path. Write-side operations (`upsertAgendaEvent`, `softDeleteAgendaEvent`, `completeAgendaEvent`) enqueue and attempt one inline pass; on failure the row stays queued with exponential backoff.
- Add a drain endpoint under `src/routes/api/public/hooks/google-calendar-sync.ts`, secret-protected like the existing `agenda-reminders` hook, and schedule it with `pg_cron` (every minute) to retry pending rows and clear them on success.
- Sync stays keyed on `(event_id, user_id)` upsert, so repeated drains never duplicate Google events.

### 4. Auto-sync, no manual button
- Remove the "Sincronizar próximos eventos" button and the `backfillMyGoogleAgenda` call from `GoogleCalendarCard.tsx`.
- Trigger the backfill server-side instead: the OAuth callback already calls `backfillGoogleSyncForUser` — route it through the new queue so it retries, and it then covers both first connection and reconnection.
- Keep `backfillMyGoogleAgenda` as a server function (used by the callback), just unexposed in the UI.
- Replace the button area with a passive status line: connected account, last sync time, and error state when present.

### 5. Validation with real data
- Re-run sync for the 3 currently failing events after the affected users reconnect, and verify `agenda_event_google_syncs` rows match exactly `{creator, responsible, participants}` for each event.
- Cross-check a broker account and an admin account: confirm the broker sees only their events, the admin sees all, and that admin *visibility* of another broker's event produces **no** sync row for the admin.
- Verify a reassignment removes the previous responsible user's mapping row and their Google copy.

### Technical notes
- No policy, function, or grant is weakened or duplicated; the only schema change is the additive retry-queue table plus its GRANTs and RLS (service-role only).
- All recipient resolution stays in `google.server.ts` under the service-role client, driven by persisted relationships, never by the RLS visibility query.
