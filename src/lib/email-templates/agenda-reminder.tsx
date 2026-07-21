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

export interface AgendaReminderProps {
  destinatarioNome?: string
  eventoTitulo?: string
  eventoTipo?: string
  inicioIso?: string
  local?: string
  clienteNome?: string
  imovelDescricao?: string
  antecedenciaLabel?: string
  offsetMin?: number
  link?: string
}

function labelAntecedencia(min?: number, fallback?: string) {
  if (fallback) return fallback
  if (!min || min <= 0) return 'em instantes'
  if (min >= 1440) return `em ${Math.round(min / 1440)} dia(s)`
  if (min >= 60) return `em ${Math.round(min / 60)} hora(s)`
  return `em ${min} minutos`
}

function formatData(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

const Email = (props: AgendaReminderProps) => {
  const nome = (props.destinatarioNome ?? '').trim() || 'Olá'
  const titulo = (props.eventoTitulo ?? '').trim() || 'Compromisso da agenda'
  const quando = formatData(props.inicioIso)
  const antecedencia = labelAntecedencia(props.offsetMin, props.antecedenciaLabel)
  const link = props.link || 'https://cordialgestao.com/agenda'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Lembrete: {titulo} {antecedencia}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={brand}>Gestão Cordial &amp; Morar</Heading>
            <Text style={tagline}>Lembrete de agenda</Text>
          </Section>

          <Section>
            <Heading as="h2" style={h2}>{titulo}</Heading>
            <Text style={p}>Olá, {nome}.</Text>
            <Text style={p}>
              Este é um lembrete do seu compromisso <strong>{antecedencia}</strong>.
            </Text>
          </Section>

          <Section style={summaryBox}>
            <Text style={summaryTitle}>Detalhes</Text>
            {quando ? <Text style={summaryLine}><strong>Quando:</strong> {quando}</Text> : null}
            {props.eventoTipo ? <Text style={summaryLine}><strong>Tipo:</strong> {props.eventoTipo}</Text> : null}
            {props.local ? <Text style={summaryLine}><strong>Local:</strong> {props.local}</Text> : null}
            {props.clienteNome ? <Text style={summaryLine}><strong>Cliente:</strong> {props.clienteNome}</Text> : null}
            {props.imovelDescricao ? <Text style={summaryLine}><strong>Imóvel:</strong> {props.imovelDescricao}</Text> : null}
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Button href={link} style={cta}>Abrir na agenda</Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Você recebeu este e-mail porque é responsável ou participante deste compromisso.<br />
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
    const t = (data?.eventoTitulo ?? '').toString().trim() || 'Compromisso da agenda'
    const a = labelAntecedencia(data?.offsetMin, data?.antecedenciaLabel)
    return `Lembrete: ${t} ${a}`
  },
  displayName: 'Agenda — lembrete de evento',
  previewData: {
    destinatarioNome: 'Felipe',
    eventoTitulo: 'Visita — Casa Cod 1187',
    eventoTipo: 'Visita',
    inicioIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    local: 'Rua das Palmeiras, 123',
    clienteNome: 'Ana Beatriz',
    imovelDescricao: 'Casa 3 dormitórios',
    offsetMin: 60,
    link: 'https://cordialgestao.com/agenda',
  },
} satisfies TemplateEntry
