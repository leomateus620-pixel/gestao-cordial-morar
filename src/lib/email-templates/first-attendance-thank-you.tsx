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

export interface FirstAttendanceProps {
  clienteNome?: string
  imobiliaria?: 'cordial' | 'morar' | string
  finalidade?: 'compra' | 'aluguel' | 'ambos' | string
  tipoImovel?: string
  regiao?: string
  orcamentoMin?: number
  orcamentoMax?: number
  replyTo?: string
}

function nomeImobiliaria(v?: string) {
  if (v === 'cordial') return 'Cordial Imóveis'
  if (v === 'morar') return 'Morar Imóveis'
  return 'Gestão Cordial & Morar'
}

function finalidadeLabel(v?: string) {
  if (v === 'compra') return 'compra'
  if (v === 'aluguel') return 'locação'
  return 'busca'
}

function tipoImovelLabel(v?: string) {
  if (!v) return 'imóvel'
  const map: Record<string, string> = {
    apartamento: 'apartamento',
    casa: 'casa',
    sitio: 'sítio',
    sítio: 'sítio',
    terreno: 'terreno',
    sala_comercial: 'sala comercial',
    galpao: 'galpão',
    cobertura: 'cobertura',
    studio: 'studio',
  }
  const key = String(v).toLowerCase()
  return map[key] ?? String(v).toLowerCase()
}

function regiaoLabel(v?: string) {
  const t = (v ?? '').trim()
  if (!t || /^a\s*definir$/i.test(t) || t.toLowerCase() === 'null' || t.toLowerCase() === 'undefined') return ''
  return t
}

function formatBRL(n?: number) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function faixaLabel(min?: number, max?: number) {
  const a = formatBRL(min)
  const b = formatBRL(max)
  if (a && b) return `${a} a ${b}`
  if (a) return `a partir de ${a}`
  if (b) return `até ${b}`
  return ''
}

const Email = (props: FirstAttendanceProps) => {
  const nome = (props.clienteNome ?? '').trim() || 'tudo bem'
  const imob = nomeImobiliaria(props.imobiliaria)
  const fin = finalidadeLabel(props.finalidade)
  const tipo = tipoImovelLabel(props.tipoImovel)
  const reg = regiaoLabel(props.regiao)
  const faixa = faixaLabel(props.orcamentoMin, props.orcamentoMax)
  const replyTo = props.replyTo || 'atendimento@cordialgestao.com'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Obrigado pelo contato — {imob}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={brand}>Gestão Cordial &amp; Morar</Heading>
            <Text style={tagline}>{imob}</Text>
          </Section>

          <Section>
            <Heading as="h2" style={h2}>Obrigado pelo contato</Heading>
            <Text style={p}>Olá, {nome}.</Text>
            <Text style={p}>
              Obrigado pelo seu contato e pela confiança em considerar a <strong>{imob}</strong>{' '}
              como opção para ajudar na {fin} do seu próximo imóvel.
            </Text>
            <Text style={p}>
              Recebemos seu interesse em <strong>{tipo}</strong>
              {reg ? <> na região de <strong>{reg}</strong></> : null}
              {faixa ? <>, com faixa de investimento de <strong>{faixa}</strong></> : null}
              . Nossa equipe já está organizando as melhores opções para dar continuidade ao seu atendimento.
            </Text>
          </Section>

          <Section style={summaryBox}>
            <Text style={summaryTitle}>Resumo do seu interesse</Text>
            <Text style={summaryLine}><strong>Finalidade:</strong> {fin}</Text>
            <Text style={summaryLine}><strong>Tipo de imóvel:</strong> {tipo}</Text>
            {reg ? <Text style={summaryLine}><strong>Região:</strong> {reg}</Text> : null}
            {faixa ? <Text style={summaryLine}><strong>Faixa:</strong> {faixa}</Text> : null}
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Text style={p}>
              Gostaria de agendar uma visita para conhecer opções de <strong>{tipo}</strong> alinhadas ao seu perfil?
            </Text>
            <Button
              href={`mailto:${replyTo}?subject=${encodeURIComponent('Quero agendar uma visita')}`}
              style={cta}
            >
              Agendar uma visita
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Atenciosamente,<br />
            Equipe {imob}<br />
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
const cta = { background: '#f97316', color: '#1f2937', padding: '12px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e2e8f0', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#64748b', lineHeight: '18px' }

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const i = data?.imobiliaria
    if (i === 'cordial') return 'Obrigado pelo contato com a Cordial Imóveis'
    if (i === 'morar') return 'Obrigado pelo contato com a Morar Imóveis'
    return 'Obrigado pelo contato com a Gestão Cordial & Morar'
  },
  displayName: 'Atendimento — agradecimento de primeiro contato',
  previewData: {
    clienteNome: 'Leonardo',
    imobiliaria: 'cordial',
    finalidade: 'compra',
    tipoImovel: 'apartamento',
    regiao: 'Centro',
    orcamentoMin: 500000,
    orcamentoMax: 1000000,
  },
} satisfies TemplateEntry
