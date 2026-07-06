# Backend real do menu Relatórios

## Diagnóstico

O menu **Relatórios** (`src/routes/_app.relatorios.tsx` → `ReportsPage` → `buildReportsOverview` em `src/services/reports.ts`) já está bem estruturado:

- **Já conectado a dados reais no Supabase** (via hooks existentes): Agenciamentos, Atendimentos, Clientes, Aluguéis, Vendas.
- **Cálculos, períodos e comparações** (`hoje`, `semana`, `últimos 7/30 dias`, `mês`, `custom`, `período anterior`/`mês anterior`/`semana anterior`) já implementados em `buildReportsOverview`, com KPIs, séries, rankings, insights, delta%, tratamento de divisão por zero e estados vazios.
- **Ainda usa mock**: **Financeiro** (`lancamentosSeed`) e **Marketing** (`campanhasMarketingSeed`) — vêm de `src/store/app-store.ts` / `src/lib/mock/data.ts`. Não existem tabelas `financeiro_lancamentos` nem `marketing_campaigns` no banco.
- **`corretores`** também é seed no `app-store`, mas o ranking de equipe já é reconstruído em vários módulos a partir de dados reais; para Relatórios ele só é usado como lookup de nome.
- Índices para queries típicas de relatórios já existem em várias tabelas, mas faltam índices compostos por `(created_by, created_at)` / `(user_id, sale_date)` e datas específicas.

O trabalho real, portanto, é: **subir Financeiro + Marketing para o Supabase**, **fortalecer índices**, **consolidar a origem via um único service/hook**, e **eliminar o mock final**.

## Arquitetura proposta

```text
Supabase (public)
├── financeiro_lancamentos      ← NOVO
├── marketing_campaigns         ← NOVO
└── marketing_daily_metrics     ← NOVO (série diária por campanha)

Server functions (createServerFn + requireSupabaseAuth)
├── src/lib/financeiro/financeiro.functions.ts   ← NOVO
├── src/lib/marketing/marketing.functions.ts     ← NOVO
└── src/lib/reports/reports.functions.ts         ← NOVO (getReportsOverview server-side, opcional/faseado)

Camada cliente
├── src/hooks/useFinanceiro.ts   ← NOVO (Query)
├── src/hooks/useMarketing.ts    ← NOVO (Query)
└── src/hooks/useReports.ts      ← NOVO (compõe hooks + buildReportsOverview)

Rotas / UI
├── src/routes/_app.relatorios.tsx  ← passa a usar useReports (sem mock)
├── src/routes/_app.financeiro.tsx  ← passa a usar useFinanceiro
└── src/routes/_app.marketing.tsx   ← passa a usar useMarketing

Store
└── src/store/app-store.ts      ← remove lancamentos/campanhasMarketing do estado global
```

`buildReportsOverview` (2019 linhas de lógica pura já testada visualmente) é **mantido**. Só troca a origem dos dados de Financeiro e Marketing (mock → Supabase) e passa a ser chamado dentro de `useReports`.

## Etapas

### 1. Migração — Financeiro
Tabela `public.financeiro_lancamentos` com: `user_id` (auth.users), `imobiliaria` (`cordial`/`morar`), `tipo` (`receita`/`despesa`), `categoria`, `descricao`, `valor` (numeric > 0), `data_competencia`, `data_pagamento` (nullable), `status` (`previsto`/`pago`/`atrasado`/`cancelado`), `origem` (`venda`/`aluguel`/`manual`/...), `origem_id` (uuid nullable — link opcional a `real_estate_sales`/`rental_contracts`), `corretor_id`, `observacoes`. `created_at`/`updated_at` + trigger `touch_updated_at`.

- GRANTs para `authenticated` e `service_role`.
- RLS: dono lê/edita o próprio; `admin` (via `has_role`) lê tudo.
- Índices: `(user_id, data_competencia)`, `(user_id, status)`, `(imobiliaria, data_competencia)`, `(user_id, tipo, data_competencia)`.

### 2. Migração — Marketing
- `public.marketing_campaigns`: `user_id`, `imobiliaria`, `nome`, `canal`, `status` (`ativa`/`pausada`/`encerrada`/`planejada`), `data_inicio`, `data_fim`, `investimento_total` numeric, `objetivo`, `regiao`, `observacoes`.
- `public.marketing_daily_metrics`: `campaign_id` (FK cascade), `user_id`, `data`, `views` int, `clicks` int, `leads` int, `investimento` numeric, `conversoes` int. `UNIQUE(campaign_id, data)`.
- GRANTs, RLS por dono + admin, trigger `updated_at`.
- Índices: `campaigns(user_id, data_inicio)`, `campaigns(user_id, status)`, `daily(campaign_id, data)`, `daily(user_id, data)`.

### 3. Índices adicionais para queries de relatório
Nas tabelas existentes (sem alterar schema):
- `agenciamentos (created_by, created_at)`, `(imobiliaria, created_at)`
- `attendances (created_by, created_at)`, `(status, created_at)`
- `clients (created_by, created_at)`
- `rental_contracts (created_by, data_inicio)`, `(status, data_fim)`
- `real_estate_sales (user_id, sale_date, sale_status)`

### 4. Server functions
- `financeiro.functions.ts`: `listLancamentos`, `createLancamento`, `updateLancamento`, `deleteLancamento` — todas com `requireSupabaseAuth`, mapper snake→camel, tipos derivados de `Database`.
- `marketing.functions.ts`: `listCampaigns` (agrega `daily_metrics` por campanha), `createCampaign`, `updateCampaign`, `deleteCampaign`, `upsertDailyMetric`.
- Ambos retornam DTOs planos compatíveis com os tipos atuais (`Lancamento`, `MarketingCampaign`) para reaproveitar `buildReportsOverview` sem refactor.

### 5. Hooks
- `useFinanceiro()` e `useMarketing()`: mesma forma dos hooks existentes (`useRentals`, `useSales`) — `useQuery` + mutations com `invalidateQueries`.
- `useReports()`: compõe `useAgenciamentos`, `useAttendances`, `useClients`, `useRentals`, `useSales`, `useFinanceiro`, `useMarketing`, calcula `sourceStates` (loading/error/unavailable/ready) e retorna `{ overview, sourceStates, isLoading, isError }` para a UI. Aceita `{ periodPreset, comparisonMode, customStart, customEnd, agency }`.

### 6. UI — refinos mínimos
- `_app.relatorios.tsx` passa a usar `useReports` (remove 7 hooks inline).
- `_app.financeiro.tsx` e `_app.marketing.tsx` trocam `useApp(state.lancamentos)`/`state.campanhasMarketing` por `useFinanceiro()`/`useMarketing()` mantendo componentes (`FinancialDashboard`, `MarketingDashboard`) intactos.
- `ReportsPage`: manter identidade visual; apenas ajustar `EmptyState` de área quando `sourceStates[area].status === "empty"` (já suportado no tipo).
- Sem mudanças em sidebar, topbar, autenticação ou layout global.

### 7. Remoção de mock
- Remove `lancamentos`, `campanhasMarketing`, `lancamentosSeed`, `campanhasMarketingSeed` do `app-store.ts` e `mock/data.ts` **apenas se não houver outros consumidores** (verificar com ripgrep antes da remoção).
- Tipos `Lancamento`/`CampanhaMarketing` movidos para `src/types/financeiro.ts` e `src/types/marketing.ts` (se ainda não existir versão dedicada).
- `corretores` continua no store por enquanto (é usado só como lookup de nome; migrar equipe é fora do escopo desta task).

### 8. Segurança
- Todas as novas tabelas com RLS `USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'))`.
- `daily_metrics` também escopa via join na campaign owner (validação dupla).
- Todas as server functions usam `requireSupabaseAuth` → RLS aplicada como usuário.
- Nenhuma query global sem escopo; nenhum uso de `supabaseAdmin`.

### 9. Estados & performance
- `useReports` propaga `isLoading` por área e retorna `overview` parcial usando o que já chegou (o service já lida com arrays vazios).
- Skeletons e empty states existentes em `ReportsPage` são reaproveitados.
- Queries do TanStack Query com `staleTime` de 30–60s para reduzir refetch em troca de filtro.
- Filtros de período/comparação são puramente client-side sobre os arrays baixados → sem round-trip por mudança de preset.

### 10. Validação
- `bun run build` + typecheck.
- Testar manualmente: sem dados (empty states), com dados reais, cada preset de período + cada modo de comparação, troca de imobiliária (Cordial/Morar), desktop e mobile.
- Verificar isolamento: usuário não-admin não vê dados de outro `user_id`.
- Sem `NaN`/`Infinity` nos cards (já tratado em `buildReportsOverview`).

## Entregáveis
- 2 migrações SQL (financeiro + marketing + índices auxiliares).
- 2 arquivos de server functions novos + 1 hook `useReports` + 2 hooks de domínio.
- Atualizações em 3 rotas (`relatorios`, `financeiro`, `marketing`) e limpeza no `app-store`/`mock/data`.
- Zero mudanças em sidebar/layout/auth.

## Perguntas antes de codar
1. **Financeiro** — o formulário atual só existe no `FinancialDashboard` (mock). Posso reaproveitar o schema atual do mock (`tipo`, `categoria`, `valor`, `status`, `data`) e expor CRUD real no menu Financeiro na mesma tarefa, ou você prefere que Financeiro continue read-only nesta etapa e o CRUD venha em outra?
2. **Marketing** — mesma pergunta: crio CRUD de campanhas + métricas diárias já nesta task, ou mantenho apenas leitura/estrutura para popular via seed manual/admin depois?
3. **Multi-tenant** — mantenho o padrão dos demais módulos (isolamento por `user_id` + `admin` vê tudo, e `imobiliaria` como discriminador Cordial/Morar), certo? Não existe tabela `companies/tenants` no projeto.
