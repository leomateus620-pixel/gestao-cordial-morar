## Objetivo

Transformar o card **"Performance da equipe"** (atualmente no dashboard inicial, dados mock vindos da store Zustand) em um gráfico real, alimentado por dados do banco (atendimentos + agenciamentos), com uma terceira métrica de **Agenciamentos** e visual mais moderno.

## Escopo

Somente o card "Performance da equipe" do `/` (admin/owner). Os demais cards do dashboard, o `TeamPerformanceCard` (ranking top 3) e o `AgenciamentosTeamCard` não serão alterados.

## 1. Backend — nova rota de dados agregados

Criar `src/lib/equipe/equipe.functions.ts` com `getEquipePerformance`:

- `createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])`
- Verifica `has_role(userId, 'admin')` — se não, retorna `[]` (admin-only).
- Lê em paralelo:
  - `attendances`: `corretor_id, corretor_nome, status, imobiliaria, created_at`
  - `agenciamentos`: `corretor_id, corretor_nome, imobiliaria, data_agenciamento`
- Filtra por período (`mes` | `ultimos_30` | `trimestre` | `ano` — default `mes`) e por imobiliária (opcional).
- Agrega por `corretor_id` (fallback `corretor_nome`):
  - `atendimentos` = total de atendimentos no período
  - `contratos` = atendimentos com `status = 'fechado'`
  - `agenciamentos` = total de agenciamentos no período
  - `conversao` = `round(contratos / atendimentos * 100)`
- Retorna DTO ordenado por `atendimentos` desc, top 6:
  ```ts
  { corretorId: string; nome: string; primeiroNome: string;
    atendimentos: number; contratos: number; agenciamentos: number; conversao: number; }[]
  ```

Input validator com Zod aceita `{ periodo, imobiliaria }`.

Sem migração de banco (todas as tabelas e RLS já existem; o admin lê todas as linhas via política existente).

## 2. Frontend — hook + chart

**Hook** `src/hooks/useEquipePerformance.ts`:
- `useSuspenseQuery`-livre (`useQuery` com `enabled = isAdminOwner`), `queryKey: ['equipe-performance', periodo, agency]`.
- Retorna `{ data, isLoading, totals: { atendimentos, contratos, agenciamentos, conversaoMedia } }`.

**`src/routes/_app.index.tsx`**:
- Remover uso de `dashboardChart: equipeChart` do `useCorretores`.
- Substituir o `<ChartCard>` por um novo componente `TeamPerformanceChart` (arquivo dedicado) que:
  - Header com título, subtítulo e **três KPIs em destaque** (Atendimentos / Contratos / Agenciamentos totais do período) com cores correspondentes.
  - Eyebrow continua "6 MESES" → trocar para label dinâmico do período (ex.: "Este mês").
  - Gráfico horizontal `BarChart` com **3 séries**:
    - Atendimentos — `chartCordial` (azul) — gradient
    - Contratos — `chartMorar` (laranja) — gradient
    - Agenciamentos — `chartSystem` (azul-petróleo) — gradient (cor nova, conforme pedido)
  - `barSize` reduzido, espaçamento maior, cantos `[0,8,8,0]`.
  - `LabelList` no fim de cada barra com o valor (destaca os números).
  - Tooltip rica com a taxa de conversão por corretor.
  - Estado vazio: `EmptyState` "Sem atividade no período".
  - Estado loading: skeleton de 4 linhas.
- Manter a `ResponsiveContainer` e alturas atuais.

## 3. Limpeza de mock

- `getCorretoresDashboardChart` e o retorno `dashboardChart` de `useCorretores` deixam de ser consumidos pelo dashboard. Manter a função (ainda usada internamente para tipagem ou futuro), mas remover o consumo no `_app.index.tsx`.
- Nada removido da store Zustand: `equipeRanking`/`equipeSummary` ainda alimentam `TeamPerformanceCard` (fora do escopo).

## 4. Validação

- `bunx tsgo --noEmit` limpo.
- `supabase--read_query` para conferir contagem por corretor (sanity check do agregado vs. SQL direto).
- Verificação visual via Playwright em `/` autenticado: card renderiza 3 barras por corretor + KPIs no header.

## Arquivos

- **novo** `src/lib/equipe/equipe.functions.ts`
- **novo** `src/hooks/useEquipePerformance.ts`
- **novo** `src/components/dashboard/TeamPerformanceChart.tsx`
- **editado** `src/routes/_app.index.tsx` (substituir o ChartCard inline)
