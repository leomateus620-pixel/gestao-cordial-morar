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

export interface BrokerAssignmentProps {
  corretorNome?: string
  clienteNome?: string
  telefone?: string
  imobiliaria?: 'cordial' | 'morar' | string
  finalidade?: string
  tipoImovel?: string
  regiao?: string
  orcamentoMin?: number
  orcamentoMax?: number
  atribuidoPor?: string
  link?: string
}

function nomeImobiliaria(v?: string) {
  if (v === 'cordial') return 'Cordial Imóveis'
  if (v === 'morar') return 'Morar Imóveis'
  return 'Gestão Cordial & Morar'
}

function formatBRL(n?: number) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function faixa(min?: number, max?: number) {
  const a = formatBRL(min)
  const b = formatBRL(max)
  if (a && b) return `${a} – ${b}`
  if (a) return `a partir de ${a}`
  if (b) return `até ${b}`
  return ''
}

const Email = (props: BrokerAssignmentProps) => {
  const nome = (props.corretorNome ?? '').trim() || 'Corretor(a)'
  const cliente = (props.clienteNome ?? '').trim() || 'novo cliente'
  const imob = nomeImobiliaria(props.imobiliaria)
  const link = props.link || 'https://cordialgestao.com/atendimentos'
  const orc = faixa(props.orcamentoMin, props.orcamentoMax)

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Novo atendimento atribuído — {cliente}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={brand}>Gestão Cordial &amp; Morar</Heading>
            <Text style={tagline}>{imob}</Text>
          </Section>

          <Section>
            <Heading as="h2" style={h2}>Novo atendimento para você</Heading>
            <Text style={p}>Olá, {nome}.</Text>
            <Text style={p}>
              Um novo atendimento foi atribuído a você{props.atribuidoPor ? <> por <strong>{props.atribuidoPor}</strong></> : null}. Entre em contato o quanto antes para dar continuidade.
            </Text>
          </Section>

          <Section style={summaryBox}>
            <Text style={summaryTitle}>Resumo do lead</Text>
            <Text style={summaryLine}><strong>Cliente:</strong> {cliente}</Text>
            {props.telefone ? <Text style={summaryLine}><strong>Telefone:</strong> {props.telefone}</Text> : null}
            {props.finalidade ? <Text style={summaryLine}><strong>Finalidade:</strong> {props.finalidade}</Text> : null}
            {props.tipoImovel ? <Text style={summaryLine}><strong>Tipo:</strong> {props.tipoImovel}</Text> : null}
            {props.regiao ? <Text style={summaryLine}><strong>Região:</strong> {props.regiao}</Text> : null}
            {orc ? <Text style={summaryLine}><strong>Faixa:</strong> {orc}</Text> : null}
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '24px' }}>
            <Button href={link} style={cta}>Abrir atendimento</Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Você recebeu este e-mail porque foi definido como corretor(a) responsável.<br />
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
    const c = (data?.clienteNome ?? '').toString().trim()
    return c ? `Novo atendimento atribuído — ${c}` : 'Novo atendimento atribuído a você'
  },
  displayName: 'Atendimento — atribuição ao corretor',
  previewData: {
    corretorNome: 'Felipe',
    clienteNome: 'Ana Beatriz',
    telefone: '(54) 99999-0000',
    imobiliaria: 'cordial',
    finalidade: 'compra',
    tipoImovel: 'apartamento',
    regiao: 'Centro',
    orcamentoMin: 400000,
    orcamentoMax: 700000,
    atribuidoPor: 'Bianca',
    link: 'https://cordialgestao.com/atendimentos',
  },
} satisfies TemplateEntry
