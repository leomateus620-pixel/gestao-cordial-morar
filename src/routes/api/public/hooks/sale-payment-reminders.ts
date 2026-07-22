import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from '@/lib/email-templates/registry'

/**
 * Dispatcher de lembretes de parcelas de venda.
 * Chamado diariamente por pg_cron. Autenticado por `apikey` = SUPABASE_PUBLISHABLE_KEY.
 *
 * Regras:
 * - Envia lembrete no dia do vencimento e 1 dia antes (véspera) por padrão.
 * - Canais: `notification` (in-app) para owner + admins, e `email` para o mesmo grupo.
 * - Idempotência: coluna `notified_at` na linha da parcela + idempotency_key
 *   `sale-payment-<id>-<yyyy-mm-dd>-<userId>-<channel>` no envio de e-mail.
 *
 * Modo teste: POST body { paymentId, force: true, daysUntilDue?: number }.
 */

const SITE_NAME = 'gestao-cordial-morar'
const SENDER_DOMAIN = 'notify.cordialgestao.com'
const FROM_DOMAIN = 'cordialgestao.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function todayBRTOffset(offsetDays: number): string {
  const now = new Date()
  // Compute today's date in America/Sao_Paulo (UTC-3, no DST currently).
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  brt.setUTCDate(brt.getUTCDate() + offsetDays)
  return brt.toISOString().slice(0, 10)
}

type TestBody = {
  paymentId?: string
  force?: boolean
  daysUntilDue?: number
}

export const Route = createFileRoute('/api/public/hooks/sale-payment-reminders')({
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

        let body: TestBody = {}
        try {
          const text = await request.text()
          if (text) body = JSON.parse(text) as TestBody
        } catch {
          body = {}
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const force = body.force === true
        const today = todayBRTOffset(0)
        const tomorrow = todayBRTOffset(1)

        // Fetch payments to consider.
        let query = admin
          .from('sale_payments')
          .select(
            'id, sale_id, kind, sequence, amount, due_date, paid, notified_at, real_estate_sales(id, user_id, property_name, buyer_name, sale_status)',
          )

        if (body.paymentId) {
          query = query.eq('id', body.paymentId)
        } else {
          query = query.eq('paid', false).in('due_date', [today, tomorrow])
        }

        const { data: payments, error } = await query
        if (error) {
          console.error('[sale-payments] fetch failed', error)
          return Response.json({ error: error.message }, { status: 500 })
        }

        const dispatched: any[] = []
        const skipped: any[] = []

        // Preload admin recipients.
        const { data: adminRoles } = await admin
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
        const adminIds = new Set<string>()
        for (const r of adminRoles ?? []) if (r.user_id) adminIds.add(r.user_id as string)

        for (const p of payments ?? []) {
          const sale = (p as any).real_estate_sales
          if (!sale) {
            skipped.push({ paymentId: p.id, reason: 'sale_missing' })
            continue
          }
          if (sale.sale_status === 'cancelada') {
            skipped.push({ paymentId: p.id, reason: 'sale_cancelled' })
            continue
          }

          const daysUntilDue = typeof body.daysUntilDue === 'number'
            ? body.daysUntilDue
            : diffDays(p.due_date as string, today)

          // Recipients: sale owner + all admins.
          const recipientIds = new Set<string>(adminIds)
          if (sale.user_id) recipientIds.add(sale.user_id as string)

          // Load profiles.
          const ids = Array.from(recipientIds)
          const { data: profiles } = await admin
            .from('profiles')
            .select('id, nome, email')
            .in('id', ids)
          const byId = new Map<string, { id: string; nome: string | null; email: string | null }>()
          for (const pr of profiles ?? []) byId.set(pr.id as string, pr as any)

          for (const userId of ids) {
            const prof = byId.get(userId)

            // Idempotency per (payment, today) — use notification metadata for the notif channel.
            const notifKey = `${p.id}:${today}:notification:${userId}`
            const emailKey = `${p.id}:${today}:email:${userId}`

            // Notification
            const { data: existingNotif } = await admin
              .from('notifications')
              .select('id')
              .eq('user_id', userId)
              .eq('tipo', 'venda_vencimento')
              .contains('metadata', { dedup_key: notifKey })
              .maybeSingle()

            if (existingNotif && !force) {
              skipped.push({ paymentId: p.id, userId, channel: 'notification', reason: 'already_delivered' })
            } else {
              const label = labelParcela(p.kind as string, p.sequence as number)
              const titulo = daysUntilDue === 0
                ? `${label} vence hoje`
                : daysUntilDue > 0
                  ? `${label} vence em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}`
                  : `${label} vencida há ${Math.abs(daysUntilDue)} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'}`
              const mensagem = [
                `Imóvel: ${sale.property_name ?? '—'}`,
                sale.buyer_name ? `Comprador: ${sale.buyer_name}` : null,
                `Valor: ${formatBRL(Number(p.amount))}`,
                `Vencimento: ${formatDate(p.due_date as string)}`,
              ]
                .filter(Boolean)
                .join(' · ')

              const { error: notifErr } = await admin.from('notifications').insert({
                user_id: userId,
                tipo: 'venda_vencimento',
                titulo,
                mensagem,
                link: `/vendas?id=${sale.id}`,
                lida: false,
                metadata: {
                  dedup_key: notifKey,
                  sale_id: sale.id,
                  payment_id: p.id,
                  due_date: p.due_date,
                  days_until_due: daysUntilDue,
                },
              })
              if (notifErr) {
                console.error('[sale-payments] notif insert failed', notifErr)
                skipped.push({ paymentId: p.id, userId, channel: 'notification', reason: notifErr.message })
              } else {
                dispatched.push({ paymentId: p.id, userId, channel: 'notification' })
              }
            }

            // Email
            if (!prof?.email) {
              skipped.push({ paymentId: p.id, userId, channel: 'email', reason: 'no_email' })
              continue
            }
            const normalizedEmail = prof.email.toLowerCase()

            // Suppression
            const { data: suppressed } = await admin
              .from('suppressed_emails')
              .select('id')
              .eq('email', normalizedEmail)
              .maybeSingle()
            if (suppressed) {
              skipped.push({ paymentId: p.id, userId, channel: 'email', reason: 'suppressed' })
              continue
            }

            // Idempotency check on email_send_log
            if (!force) {
              const { data: alreadySent } = await admin
                .from('email_send_log')
                .select('id')
                .eq('message_id', emailKey)
                .maybeSingle()
              if (alreadySent) {
                skipped.push({ paymentId: p.id, userId, channel: 'email', reason: 'already_sent' })
                continue
              }
            }

            // Unsubscribe token
            let unsubscribeToken: string
            const { data: existingToken } = await admin
              .from('email_unsubscribe_tokens')
              .select('token, used_at')
              .eq('email', normalizedEmail)
              .maybeSingle()
            if (existingToken && !existingToken.used_at) {
              unsubscribeToken = existingToken.token as string
            } else if (!existingToken) {
              unsubscribeToken = generateToken()
              await admin
                .from('email_unsubscribe_tokens')
                .upsert(
                  { token: unsubscribeToken, email: normalizedEmail },
                  { onConflict: 'email', ignoreDuplicates: true },
                )
              const { data: stored } = await admin
                .from('email_unsubscribe_tokens')
                .select('token')
                .eq('email', normalizedEmail)
                .maybeSingle()
              unsubscribeToken = (stored?.token as string) ?? unsubscribeToken
            } else {
              skipped.push({ paymentId: p.id, userId, channel: 'email', reason: 'unsubscribed' })
              continue
            }

            const templateName = 'sale-payment-due'
            const template = TEMPLATES[templateName]
            if (!template) {
              skipped.push({ paymentId: p.id, userId, channel: 'email', reason: 'template_missing' })
              continue
            }

            const templateData = {
              destinatarioNome: prof.nome ?? '',
              imovelNome: sale.property_name ?? '',
              compradorNome: sale.buyer_name ?? '',
              kind: p.kind as 'entrada' | 'parcela',
              sequenceLabel: labelParcela(p.kind as string, p.sequence as number),
              valor: Number(p.amount),
              dueDate: p.due_date as string,
              daysUntilDue,
              link: `https://cordialgestao.com/vendas?id=${sale.id}`,
            }

            const element = React.createElement(template.component as any, templateData)
            const html = await renderAsync(element)
            const plainText = await renderAsync(element, { plainText: true })
            const resolvedSubject =
              typeof template.subject === 'function' ? template.subject(templateData) : template.subject

            await admin.from('email_send_log').insert({
              message_id: emailKey,
              template_name: templateName,
              recipient_email: prof.email,
              status: 'pending',
            })

            const { error: enqueueError } = await admin.rpc('enqueue_email', {
              queue_name: 'transactional_emails',
              payload: {
                message_id: emailKey,
                to: prof.email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject: resolvedSubject,
                html,
                text: plainText,
                purpose: 'transactional',
                label: templateName,
                idempotency_key: emailKey,
                unsubscribe_token: unsubscribeToken,
                queued_at: new Date().toISOString(),
              },
            })

            if (enqueueError) {
              console.error('[sale-payments] enqueue failed', enqueueError)
              await admin.from('email_send_log').insert({
                message_id: emailKey,
                template_name: templateName,
                recipient_email: prof.email,
                status: 'failed',
                error_message: enqueueError.message,
              })
              skipped.push({ paymentId: p.id, userId, channel: 'email', reason: enqueueError.message })
              continue
            }

            dispatched.push({ paymentId: p.id, userId, channel: 'email' })
          }

          // Mark row as notified (so daily reruns won't re-check as often; the per-user
          // dedup above still guards against duplicates.)
          await admin
            .from('sale_payments')
            .update({ notified_at: new Date().toISOString() })
            .eq('id', p.id)
        }

        return Response.json({
          ok: true,
          scanned: payments?.length ?? 0,
          dispatched,
          skipped,
          at: new Date().toISOString(),
        })
      },
      GET: async () =>
        Response.json({ ok: true, hint: 'POST with apikey header to dispatch sale-payment reminders.' }),
    },
  },
})

function labelParcela(kind: string, sequence: number) {
  if (kind === 'entrada') return 'Entrada'
  const n = Number.isFinite(sequence) ? sequence + 1 : 1
  return `Parcela ${n}`
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function diffDays(dueDate: string, today: string) {
  const a = new Date(`${dueDate}T12:00:00Z`).getTime()
  const b = new Date(`${today}T12:00:00Z`).getTime()
  return Math.round((a - b) / (24 * 60 * 60 * 1000))
}
