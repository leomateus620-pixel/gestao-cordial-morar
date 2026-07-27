# Ciclo restante: Tasks 2, 3 (backend) e 4 — execução completa

Task 1 (RLS de Agenciamentos) e as tabelas `sale_commission_plan` / `sale_commission_installments` já foram aplicadas em migração aprovada. Agora executo o restante em uma única passada, sem novas migrações.

## Task 2 — Cards de resumo interativos

**Fonte única de verdade.** `summary` e `stats` continuam derivados do mesmo array filtrado que alimenta a lista/kanban. Nenhuma query extra.

**Search params (TanStack Router):**

- `/agenciamentos`: adicionar `validateSearch` com `focus?: "mes" | "pendentes" | "fotos" | "placas" | "site" | "validados"` usando `zodValidator` + `fallback`. Compõe com os filtros já existentes (não sobrescreve).
- `/agenda`: `focus?: "hoje" | "prox7" | "visitas" | "retornos" | "midia" | "assinaturas" | "confirmar"` idem.

**Mapeamento focus → filtro derivado (aplicado depois dos filtros do usuário):**

- Agenciamentos:
  - `mes` → recorte do mês atual (mesma regra do KPI atual)
  - `pendentes` → `!validado && status ≠ cancelado`
  - `fotos` → `!checklist.fotosDrive`
  - `placas` → `!checklist.placaInstalada`
  - `site` → `!checklist.cadastradoSite`
  - `validados` → `checklist.validado`
- Agenda:
  - `hoje` → eventos com `inicio` no dia atual (local)
  - `prox7` → próximos 7 dias
  - `visitas` → `tipo=visita`
  - `retornos` → `tipo=retorno`
  - `midia` → `tipo in (fotos, video)`
  - `assinaturas` → `tipo=assinatura`
  - `confirmar` → `status=agendado` (a confirmar)

**Componentes atualizados:**

- `AgenciamentoSummaryCards`, `AgenciamentosQuickStrip`, `AgendaSummaryCards`: cada card vira `<Link>` com `search={(prev) => ({ ...prev, focus: prev.focus === key ? undefined : key })}`, `aria-pressed`, estado ativo com borda em anel + ícone preenchido + valor sublinhado (não depende só de cor), min-height 44px.
- Rotas exibem chip "Filtrando por X · Limpar" quando `focus` está definido.
- Empty state específico por foco quando a lista fica vazia.
- Mobile: manter carrossel horizontal, adicionar `snap-x snap-mandatory` e fade nas bordas; garantir `pb-24` no wrapper.

## Task 3 — Backend do Plano de Comissão

**Tipos (`src/types/sale.ts`):**
```ts
type SaleCommissionMetodo = "pix"|"transferencia"|"boleto"|"dinheiro"|"cheque"|"desconto_repasse"|"outro";
type SaleCommissionTiming = "assinatura"|"entrada"|"primeira_parcela"|"conclusao"|"data_especifica"|"parcelado"|"outro";
type SaleCommissionInstallment = { id: string; sequence: number; amount: number; dueDate: string; paid: boolean; paidAt?: string|null };
type SaleCommissionPlan = { metodo: SaleCommissionMetodo; timing: SaleCommissionTiming; dataPagamento?: string|null; parcelado: boolean; observacoes?: string|null; installments: SaleCommissionInstallment[] };
```
`SaleRecord` ganha `commissionPlan?: SaleCommissionPlan`. `SaleRecordInput` ganha `commissionPlan?` com `installments?: { sequence?, amount, dueDate }[]`.

**`sales.functions.ts`:**

- `listSales`: passa a fazer join manual (dois selects em paralelo por sale) via `.select(..., sale_commission_plan(*), sale_commission_installments(*))` embutido no relacionamento; mapear para `commissionPlan`.
- `createSale` e `updateSale`: depois do upsert da venda, **em bloco try/catch consistente**:
  - Se `input.commissionPlan` presente: `upsert` em `sale_commission_plan` (metodo, timing, dataPagamento, parcelado, observacoes).
  - Se `parcelado`: validar soma (tolerância 1 centavo) contra `commissionValue`; recusar com erro claro se divergente ou sem `dueDate`/valor negativo. `DELETE` das installments existentes + `INSERT` das novas.
  - Se não parcelado: apagar installments existentes.
- `setSaleCommissionInstallmentPaid` (nova serverFn): marca parcela como paga/aberta. Retorna registro atualizado.
- Autorização: reutilizar `attendance_can_access`-style checks já implicit via RLS; validação server-side extra impede setar `commissionValue` divergente da soma.

**Reminders:** por segurança e escopo, o cron atual de `sale-payment-reminders` **não** é alterado nesta iteração; adiciono TODO documentado em código e no relatório final para próximo ciclo. UI já mostra "paga/em aberto/vencida" com base em `dueDate` e `paid`.

## Task 4 — UI do Plano de Comissão em `SaleForm` + `SaleDetailsDrawer`

**`SaleForm.tsx`:**

- Em "Informações da LOU": manter `Comissão (R$)` e `Comissão (%)` (bidirecionais).
- Adicionar linha compacta abaixo com:
  - `Método de pagamento` (select)
  - `Quando será paga` (select)
  - `Data prevista` (aparece quando timing = `data_especifica` ou pagamento único não-vinculado a evento)
  - Toggle `Parcelar comissão`
- Quando `Parcelar comissão = true`: renderizar componente novo `CommissionInstallmentsPlan` (arquivo `src/components/vendas/CommissionInstallmentsPlan.tsx`) inspirado no `SalePaymentPlan` existente, mas com header "PLANO DE COMISSÃO" (ícone `Percent` + accent âmbar `bg-amber-500/10`, borda âmbar) para distinguir do plano da venda.
  - Lista de parcelas: `Parcela N`, `Valor (R$)`, `Vencimento`, botão remover.
  - `+ parcela` adiciona parcela com sequence auto.
  - Rodapé: `Total da comissão`, `Soma do plano`, `Diferença` (vermelho quando ≠ 0).
- Zod client: valida soma quando `parcelado`, valida `dueDate` presente e `amount > 0`.
- Ambos schemas (client + server) rejeitam divergência.

**`SaleDetailsDrawer.tsx`:**

- Nova seção "Plano de comissão" com:
  - Cabeçalho: método + timing legíveis, valor total.
  - Se parcelado: tabela/lista de parcelas com status (`Paga em dd/mm` / `Vence em dd/mm` / `Vencida há Nd`) e botão `Marcar como paga` / `Desfazer` (usa `setSaleCommissionInstallmentPaid`).
  - Se pagamento único: chip único com data e status.
- Continua distinto visualmente do "Plano de pagamento da venda" (accent primário) — accent âmbar consistente.

**`useSales.ts`:**

- Novo mutation `setCommissionInstallmentPaid` com invalidação de `SALES_KEY`.
- Novo callback `setCommissionInstallmentPaid` exportado.

## Testes / verificação

- `bun tsgo --noEmit` para typecheck; `bun run build:dev` para garantir SSR/prerender.
- Playwright headless: login como Felipe (via `LOVABLE_BROWSER_SUPABASE_*`), navegar em `/agenciamentos`, screenshot antes/depois de clicar num card, screenshot em 390px. Login como admin, criar venda com comissão parcelada em `/vendas`, screenshot do drawer.
- Ajustes finais se algo quebrar visualmente.

## Arquivos previstos

- `src/routes/_app.agenciamentos.tsx`, `src/routes/_app.agenda.tsx`
- `src/components/agenciamentos/AgenciamentoSummaryCards.tsx`, `AgenciamentosQuickStrip.tsx`
- `src/components/agenda/AgendaSummaryCards.tsx`
- `src/types/sale.ts`
- `src/lib/sales/sales.functions.ts`
- `src/hooks/useSales.ts`
- `src/components/vendas/SaleForm.tsx`, `SaleDetailsDrawer.tsx`
- novo `src/components/vendas/CommissionInstallmentsPlan.tsx`

## Riscos

- Se `zodValidator` já usado nas rotas divergir do padrão do projeto, uso `validateSearch: (s) => ({...})` puro para consistência.
- Reminder cron de comissão fica para próximo ciclo (documentado).
