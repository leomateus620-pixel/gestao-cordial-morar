# Ciclo de correção: Agenciamentos, Agenda e Vendas

## Diagnóstico confirmado

**Bug de visibilidade em Agenciamentos.** A tabela `public.agenciamentos` tem a policy de SELECT restrita a `created_by = auth.uid() OR admin OR secretaria`. Ela ignora `corretor_id` (o campo que identifica o corretor responsável). Consequências:

- Quando a Bianca (secretaria) cadastra e vincula o Felipe, o `created_by` é da Bianca e o Felipe não enxerga o registro.
- Quando o Felipe cria para si próprio, `created_by = corretor_id = Felipe`, então em teoria vê. Mas se o formulário for salvo com `corretor_id` de outro corretor selecionado, o registro fica escondido do corretor "dono" declarado. Também há registros legados criados antes das mudanças recentes com `created_by` apontando para admins/mock.
- `corretor_id` é `TEXT` e nem sempre é um UUID válido — precisa de conversão segura no policy.

**KPIs não-interativos.** `AgenciamentoSummaryCards`, `AgenciamentosQuickStrip` e `AgendaSummaryCards` são apenas visuais. Precisamos ligá-los aos filtros existentes (`AgenciamentoFilters` já cobre status, checklist, imobiliária, período; `AgendaFilters` já cobre tipo/período), mantendo a mesma fonte canônica de dados.

**Comissão em Vendas.** `real_estate_sales` guarda `commission_value` e `commission_percentage` como escalares. `sale_payments` só cobre o plano da venda (kind `entrada`/`parcela`). Não há plano de comissão nem persistência de método/prazo.

---

## Task 1 — Restaurar visibilidade do corretor em Agenciamentos

**Migração de RLS (segura, sem afrouxar isolamento):**

- Substituir `agenciamentos_select_own_admin_or_secretaria` por uma policy que inclua também `corretor_id` do usuário logado, usando cast defensivo:
  ```sql
  USING (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'secretaria')
  )
  ```
- Aplicar o mesmo ajuste na policy de UPDATE (mantendo delete só para admin).
- Criar índice `agenciamentos_corretor_id_uuid_idx` já existe como btree em texto — suficiente.

**Correção de dados legados (idempotente):**

- Script SQL que, para registros onde `corretor_id` é um UUID válido de um profile existente e `created_by` aponta para um usuário que não corresponde nem a admin/secretaria conhecidos, **não altera `created_by`** (preserva histórico), mas garante que `corretor_nome` esteja consistente com `profiles.nome` daquele `corretor_id`. Nenhuma remoção de dado.
- Relatório (SELECT) mostrando quantos registros passam a ser visíveis para cada corretor após a policy.

**Servidor/serviço:**

- `agenciamentos.functions.ts#insertAgenciamento`: garantir que, quando o corretor logado cria sem selecionar outro corretor, `corretor_id` seja preenchido com `userId` e `corretor_nome` com o profile do usuário. Bloquear salvar com `corretor_id` vazio.
- Validar no server que quem cria com role `corretor` só pode atribuir a si mesmo (admin/secretaria podem atribuir a outros).

**Cliente:**

- `useAgenciamentos` invalida `["agenciamentos"]` após create/update (verificar; adicionar se faltar).
- `AgenciamentoFormModal`: pré-selecionar o próprio usuário quando role = corretor e travar o campo (secretaria/admin mantêm seleção livre).

**Regressão:**

- Teste (vitest) em `agenciamentos.functions.test.ts` cobrindo três cenários: (a) corretor cria para si → visível; (b) secretaria cria e vincula corretor → visível para o corretor; (c) corretor A não vê registro do corretor B; (d) admin vê tudo.
- Validação Playwright autenticada como Felipe: cria agenciamento, refetch imediato, registro aparece na lista.

---

## Task 2 — KPI cards interativos (Agenciamentos + Agenda)

**Fonte única de verdade:** manter o cálculo do `summary` derivado do mesmo array `filteredAgenciamentos` / `filteredEventos` que alimenta a listagem. Assim contagens e registros exibidos batem sempre.

**Estado do filtro em URL (TanStack search params):**

- Rota `/agenciamentos`: adicionar `validateSearch` com `focus` opcional (`"pendentes" | "fotos" | "placas" | "site" | "validados" | "mes"`). Idem para `AgendaFilters` (`focus: "hoje" | "prox7" | "visita" | "retorno" | "media" | "assinatura" | "confirmar"`).
- Cada card usa `<Link search={(prev) => ({...prev, focus: X === prev.focus ? undefined : X})}>`, produzindo toggle nativo e estado `aria-pressed` com estilo ativo (não depende só de cor: borda + ícone preenchido + underline no valor).
- O filtro `focus` compõe com os filtros existentes (status/imobiliária/tipo/checklist/busca). Ex.: `focus = "fotos"` aplica `checklist=pendentes_fotos` internamente sem sobrescrever seleções do usuário.

**Componentes atualizados:**

- `AgenciamentoSummaryCards`, `AgenciamentosQuickStrip`, `AgendaSummaryCards` → cada item vira `<Link>` (ou `<button>` para toggle) com `data-active`, foco visível, target-size ≥ 44px, e chip "Limpar filtro" ao lado do título quando `focus` está ativo.
- Empty state específico quando o `focus` filtra tudo ("Nenhum agenciamento com fotos pendentes no recorte atual.").

**Responsivo:**

- Mobile: manter carrossel horizontal com fade nas bordas + shadow indicando scroll; snap-x para melhor sensação; sem overflow-x na página.
- Desktop: grid 6 colunas (Agenciamentos) / 7 (Agenda) já em `lg:`. Adicionar hover/focus rings.
- Bottom nav fixa já tem `pb-24` no scroll container; garantir espaço quando lista filtrada é curta.

---

## Task 3 & 4 — Plano de Comissão em Vendas

**Modelo de dados (nova migração):**

- Nova tabela `public.sale_commission_plan` (1×1 com `real_estate_sales`):
  - `sale_id UUID PK REFERENCES real_estate_sales(id) ON DELETE CASCADE`
  - `metodo TEXT` (pix, transferencia, boleto, dinheiro, cheque, desconto_repasse, outro)
  - `timing TEXT` (assinatura, entrada, primeira_parcela, conclusao, data_especifica, parcelado, outro)
  - `data_pagamento DATE NULL` (usado quando timing = data_especifica ou parcela única)
  - `parcelado BOOLEAN NOT NULL DEFAULT false`
  - `observacoes TEXT`
  - timestamps + trigger `touch_updated_at`.
- Nova tabela `public.sale_commission_installments`:
  - `id UUID PK`, `sale_id UUID REFERENCES real_estate_sales(id) ON DELETE CASCADE`, `sequence INT`, `amount NUMERIC(14,2) CHECK (amount >= 0)`, `due_date DATE NOT NULL`, `paid BOOLEAN DEFAULT false`, `paid_at TIMESTAMPTZ`, `notified_at TIMESTAMPTZ`, timestamps.
  - Índices: `(sale_id)`, `(due_date) WHERE paid=false`.
- GRANTs para authenticated/service_role. RLS espelhando `sale_payments` (via EXISTS em `real_estate_sales` com regras atuais de user_id/admin/secretaria). Corretor só vê comissão da própria venda; policy respeita a regra existente de "ticket médio só para admin" no lado da agregação/KPI (não expor `commission_value` em queries usadas por não-admin fora do próprio registro).

**Backend (`sales.functions.ts`):**

- `createSale`/`updateSale` passam a aceitar `commissionPlan: { metodo, timing, dataPagamento?, parcelado, observacoes?, installments?: SalePaymentInput[] }`.
- Transação: upsert em `sale_commission_plan` + delete-and-insert das installments quando `parcelado`. Validação server-side: soma das installments === `commission_value` (tolerância 1 centavo); `due_date` obrigatório em cada parcela; sem valores negativos; datas coerentes com `sale_date`.
- `listSales` traz o plano e as parcelas (join) para o dono/admin/secretaria.
- Reaproveitar o cron/worker de `sale-payment-reminders` para também disparar lembrete de parcela de comissão vencendo (mesma tabela de estado ou queue separada — decidir na implementação usando o padrão atual).

**Frontend (`SaleForm.tsx`):**

- Em `Informações da LOU` manter `Comissão (R$)` e `Comissão (%)` com sincronização bidirecional (já parcialmente feita). Adicionar campos compactos:
  - `Método de pagamento` (select)
  - `Quando será paga` (select com as opções listadas)
  - `Data de pagamento` (aparece quando timing = data_especifica ou não-parcelado)
  - Toggle `Parcelar comissão`
- Quando `Parcelar comissão = true`, renderizar componente novo `<CommissionInstallmentsPlan>` (mesmo padrão visual/UX do `SalePaymentPlan` da imagem 2, mas com cabeçalho e cor distintos para não confundir).
- Rodapé com `Total da comissão`, `Soma do plano`, `Diferença` — validação inline em vermelho quando divergente.
- Zod schema no cliente + server garantindo consistência.
- `SaleDetailsDrawer`: nova seção "Plano de comissão" com status por parcela e ação de marcar como paga.

**Separação visual:** títulos e cor de acento diferentes entre `Plano de pagamento da venda` (accent primário atual) e `Plano de comissão` (accent secundário/âmbar). Textos auxiliares deixam claro o que cada plano representa.

**Responsivo:** validar 320/360/390/430/768/1024/1280/1440. Grid do form colapsa para 1 coluna abaixo de 640px; installments viram cards empilhados como no mobile atual.

---

## Detalhes técnicos

- Migrações: `alter_agenciamentos_broker_visibility.sql`, `create_sale_commission_plan.sql`. Sem `ALTER DATABASE`. Cada `CREATE TABLE` seguido de GRANT + RLS + policies.
- Sem quebra de tipos: regenerar `src/integrations/supabase/types.ts` automaticamente após migração.
- Testes: vitest para `agenciamentos.functions` e `sales.functions` (soma da comissão, parcelamento, permissões).
- Validação visual: Playwright headless autenticado (usar `LOVABLE_BROWSER_SUPABASE_*`) — login Felipe, criar agenciamento, screenshot; login admin, criar venda com comissão parcelada, screenshot em 390px e 1280px.
- Sem mock, sem workaround de permissão no frontend, sem duplicação de queries.

## Arquivos previstos

- SQL: 2 migrações novas.
- Backend: `src/lib/agenciamentos/agenciamentos.functions.ts`, `src/lib/sales/sales.functions.ts`, `src/types/sale.ts`, `src/types/agenciamento.ts`.
- UI: `src/routes/_app.agenciamentos.tsx`, `src/routes/_app.agenda.tsx`, `AgenciamentoSummaryCards.tsx`, `AgenciamentosQuickStrip.tsx`, `AgendaSummaryCards.tsx`, `AgenciamentoFormModal.tsx`, `SaleForm.tsx`, `SaleDetailsDrawer.tsx`, novo `CommissionInstallmentsPlan.tsx`.
- Hooks: `useSales.ts`, `useAgenciamentos.ts` (invalidations e novos campos).
- Testes: `agenciamentos.functions.test.ts`, `sales.commission.test.ts`.

## Riscos / limitações

- Registros legados com `corretor_id` inválido continuarão invisíveis para corretores até serem reatribuídos manualmente — reportarei a lista após a migração.
- Se o worker de reminders atual não suportar dois tipos de vencimento, o lembrete de comissão entra num segundo passo (documento como "próxima iteração") em vez de forçar refactor arriscado agora.
