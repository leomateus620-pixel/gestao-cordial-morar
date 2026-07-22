import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface SalePaymentDueProps {
  destinatarioNome?: string
  imovelNome?: string
  compradorNome?: string
  kind?: 'entrada' | 'parcela'
  sequenceLabel?: string
  valor?: number
  dueDate?: string
  daysUntilDue?: number
  link?: string
}

function formatBRL(v?: number) {
  if (!Number.isFinite(v)) return 'R$ 0,00'
  return (v as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso?: string) {
  if (!iso) return ''
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

function subjectFor(days?: number) {
  if (typeof days !== 'number') return 'Vencimento de parcela'
  if (days > 0) return `Parcela vence em ${days} dia${days === 1 ? '' : 's'}`
  if (days === 0) return 'Parcela vence hoje'
  return `Parcela vencida há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`
}

const Email = (props: SalePaymentDueProps) => {
  const nome = (props.destinatarioNome ?? '').trim() || 'Olá'
  const imovel = (props.imovelNome ?? '').trim() || 'Venda'
  const comprador = (props.compradorNome ?? '').trim()
  const parcelaLabel =
    props.sequenceLabel ??
    (props.kind === 'entrada' ? 'Entrada' : 'Parcela')
  const quando = formatDate(props.dueDate)
  const valor = formatBRL(props.valor)
  const link = props.link || 'https://cordialgestao.com/vendas'
  const headline = subjectFor(props.daysUntilDue)

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`${parcelaLabel} de ${valor} — ${imovel}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={brand}>Gestão Cordial &amp; Morar</Heading>
            <Text style={tagline}>Vencimento de pagamento</Text>
          </Section>

          <Section>
            <Heading as="h2" style={h2}>{headline}</Heading>
            <Text style={p}>Olá, {nome}.</Text>
            <Text style={p}>
              Este é um aviso automático sobre um pagamento vinculado a uma venda registrada no sistema.
            </Text>
          </Section>

          <Section style={summaryBox}>
            <Text style={summaryTitle}>Detalhes</Text>
            <Text style={summaryLine}><strong>Imóvel:</strong> {imovel}</Text>
            {comprador ? <Text style={summaryLine}><strong>Comprador:</strong> {comprador}</Text> : null}
            <Text style={summaryLine}><strong>Tipo:</strong> {parcelaLabel}</Text>
            <Text style={summaryLine}><strong>Valor:</strong> {valor}</Text>
            {quando ? <Text style={summaryLine}><strong>Vencimento:</strong> {quando}</Text> : null}
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Button href={link} style={cta}>Abrir venda</Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Você recebeu este e-mail porque é o responsável ou administrador desta venda.<br />
            Gestão Cordial &amp; Morar
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', color: '#1f2937' }
const container = { padding: '28px 28px 24px', maxWidth: '560px', margin: '0 auto' }
const header = { textAlign: 'center' as const, paddingBottom: '8px' }
const brand = { fontSize: '20px', color: '#174d61', margin: '0' }
const tagline = { fontSize: '12px', color: '#64748b', margin: '4px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' as const }
const h2 = { fontSize: '22px', color: '#0f172a', margin: '24px 0 12px' }
const p = { fontSize: '15px', lineHeight: '24px', margin: '0 0 12px', color: '#1f2937' }
const summaryBox = { background: '#f1f5f9', borderRadius: '12px', padding: '16px 18px', margin: '20px 0' }
const summaryTitle = { fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 8px' }
const summaryLine = { fontSize: '14px', color: '#0f172a', margin: '4px 0' }
const cta = { background: '#0f766e', color: '#ffffff', padding: '12px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e2e8f0', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#64748b', lineHeight: '18px' }

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const s = subjectFor(data?.daysUntilDue)
    const nome = (data?.imovelNome ?? '').toString().trim()
    return nome ? `${s} — ${nome}` : s
  },
  displayName: 'Vendas — vencimento de parcela',
  previewData: {
    destinatarioNome: 'Ricardo',
    imovelNome: 'Apartamento Cruzeiro Vista',
    compradorNome: 'Ana Beatriz',
    kind: 'parcela',
    sequenceLabel: 'Parcela 1',
    valor: 20000,
    dueDate: new Date().toISOString().slice(0, 10),
    daysUntilDue: 0,
    link: 'https://cordialgestao.com/vendas',
  },
} satisfies TemplateEntry
