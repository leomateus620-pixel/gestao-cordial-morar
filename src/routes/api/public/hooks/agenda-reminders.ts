import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

/**
 * Dispatcher de lembretes da Agenda.
 * Chamado a cada 1 minuto por pg_cron. Autenticado por `apikey` = SUPABASE_PUBLISHABLE_KEY (anon).
 *
 * Fluxo: seleciona lembretes ativos cuja janela de disparo (inicio - antecedencia_min)
 * caia dentro de [now() - 6min, now() + 1min], calcula os destinatários (owner + created_by +
 * participantes), e cria uma notificação in-app por (evento, offset, usuário) — idempotente via
 * `agenda_reminder_deliveries`.
 */
export const Route = createFileRoute('/api/public/hooks/agenda-reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const supabaseUrl = process.env.SUPABASE_URL

        if (!publishableKey || !serviceRoleKey || !supabaseUrl) {
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const apikey = request.headers.get('apikey') ?? request.headers.get('x-api-key')
        if (!apikey || apikey !== publishableKey) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const now = new Date()
        const upperBound = new Date(now.getTime() + 25 * 60 * 60 * 1000) // 25h ahead

        // 1. Fetch upcoming events within the horizon.
        const { data: events, error: eventsErr } = await admin
          .from('agenda_events')
          .select(
            'id, titulo, tipo, inicio, local, cliente_nome, imovel_descricao, owner_user_id, created_by, agenda_event_reminders(antecedencia_min, tipo, ativo), agenda_event_participants(user_id)'
          )
          .is('deleted_at', null)
          .gte('inicio', now.toISOString())
          .lte('inicio', upperBound.toISOString())

        if (eventsErr) {
          console.error('[agenda-reminders] events fetch failed', eventsErr)
          return Response.json({ error: eventsErr.message }, { status: 500 })
        }

        const dispatched: Array<{ eventId: string; offsetMin: number; userId: string }> = []
        const skipped: Array<{ eventId: string; offsetMin: number; reason: string }> = []

        for (const ev of events ?? []) {
          const inicioMs = new Date(ev.inicio as string).getTime()
          const reminders = (ev.agenda_event_reminders ?? []).filter(
            (r: any) => r.ativo && r.tipo === 'interno' && typeof r.antecedencia_min === 'number',
          )

          for (const r of reminders) {
            const fireAt = inicioMs - r.antecedencia_min * 60_000
            // Window: [now - 6min, now + 1min]. Cron runs every minute; 6min covers restarts/lag.
            if (fireAt < now.getTime() - 6 * 60_000 || fireAt > now.getTime() + 60_000) {
              continue
            }

            // Recipients: owner + created_by + participants (dedupe, drop nulls).
            const recipientSet = new Set<string>()
            if (ev.owner_user_id) recipientSet.add(ev.owner_user_id as string)
            if (ev.created_by) recipientSet.add(ev.created_by as string)
            for (const p of ev.agenda_event_participants ?? []) {
              if (p.user_id) recipientSet.add(p.user_id as string)
            }

            for (const userId of recipientSet) {
              // Idempotency check.
              const { data: already } = await admin
                .from('agenda_reminder_deliveries')
                .select('event_id')
                .eq('event_id', ev.id as string)
                .eq('offset_min', r.antecedencia_min)
                .eq('user_id', userId)
                .eq('channel', 'notification')
                .maybeSingle()

              if (already) {
                skipped.push({ eventId: ev.id as string, offsetMin: r.antecedencia_min, reason: 'already_delivered' })
                continue
              }

              const label = labelAntecedencia(r.antecedencia_min)
              const titulo = ((ev.titulo as string) ?? '').trim() || 'Compromisso'
              const local = (ev.local as string) ?? null
              const cliente = (ev.cliente_nome as string) ?? null
              const imovel = (ev.imovel_descricao as string) ?? null
              const inicioFmt = formatData(ev.inicio as string)
              const mensagem = [
                inicioFmt ? `Início: ${inicioFmt}` : null,
                local ? `Local: ${local}` : null,
                cliente ? `Cliente: ${cliente}` : null,
                imovel ? `Imóvel: ${imovel}` : null,
              ]
                .filter(Boolean)
                .join(' · ')

              const { error: notifErr } = await admin.from('notifications').insert({
                user_id: userId,
                tipo: 'agenda_lembrete',
                titulo: `Lembrete: ${titulo} ${label}`,
                mensagem: mensagem || null,
                link: `/agenda?id=${ev.id}`,
                lida: false,
                metadata: {
                  event_id: ev.id,
                  offset_min: r.antecedencia_min,
                  inicio: ev.inicio,
                },
              })

              if (notifErr) {
                console.error('[agenda-reminders] notification insert failed', notifErr)
                continue
              }

              const { error: delErr } = await admin.from('agenda_reminder_deliveries').insert({
                event_id: ev.id as string,
                offset_min: r.antecedencia_min,
                user_id: userId,
                channel: 'notification',
              })

              if (delErr) {
                console.error('[agenda-reminders] delivery insert failed', delErr)
              }

              dispatched.push({ eventId: ev.id as string, offsetMin: r.antecedencia_min, userId })
            }
          }
        }

        return Response.json({
          ok: true,
          scanned: events?.length ?? 0,
          dispatched: dispatched.length,
          skipped: skipped.length,
          at: now.toISOString(),
        })
      },
      GET: async () =>
        Response.json({ ok: true, hint: 'POST with apikey header to dispatch agenda reminders.' }),
    },
  },
})

function labelAntecedencia(min: number): string {
  if (min >= 1440) {
    const d = Math.round(min / 1440)
    return `em ${d} dia${d === 1 ? '' : 's'}`
  }
  if (min >= 60) {
    const h = Math.round(min / 60)
    return `em ${h} hora${h === 1 ? '' : 's'}`
  }
  return `em ${min} minutos`
}

function formatData(iso?: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return ''
  }
}
