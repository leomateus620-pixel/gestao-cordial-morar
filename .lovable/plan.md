## Situação atual (verificada)

- A tabela `agenciamentos` **não possui** nenhum campo de finalidade/transação (só `tipo_imovel`). Portanto não há campo persistido para classificar os 41 registros existentes — todos ficarão como "não classificados" para revisão administrativa (nenhum será adivinhado).
- Existem 41 agenciamentos (nenhum cancelado), de 4 corretores, entre 01/07/2026 e 30/07/2026.
- O padrão de trilhas já existe em Atendimentos (`src/lib/atendimentos/track.ts` + `PipelineTrackSelector.tsx`) e será reaproveitado como referência estrutural.
- Administradores reais confirmados: Ricardo Caetano e Bruna Weremchuk (papel `admin`) — serão resolvidos por papel/ID persistido, nunca por nome no código.
- Notificações usam a tabela `notifications` com normalização automática por trigger; nenhuma alteração de RLS existente será feita.

## O que será feito

### 1. Categoria do agenciamento (Venda / Aluguel)
- Nova coluna persistida `finalidade` em `agenciamentos` (`venda` | `aluguel`), obrigatória para novos registros e opcional (nula) para o histórico.
- Registros antigos permanecem intactos e aparecem em um bloco "Não classificados", visível só para admin/secretaria, com ação rápida para definir a categoria.
- Formulário de cadastro/edição passa a exigir a categoria logo no passo 1 (ao lado de Tipo de imóvel/Imobiliária).

### 2. Regras de bonificação (calculadas no servidor, persistidas)
Nova tabela de bonificações com chave única por corretor + categoria + nível/meta + período, garantindo idempotência (recalcular nunca duplica).

- **Venda (mensal):** `bonus = min(floor(agenciamentos/8), floor(comPlaca/4))`, por corretor e mês-calendário. Reinicia a cada mês; meses anteriores ficam preservados como histórico.
- **Aluguel (cumulativo):** 1 bonificação a cada 10 agenciamentos de aluguel válidos, sem reset mensal; saldo restante conta para a próxima meta.
- Agenciamentos cancelados não contam. Ao cancelar, reatribuir, excluir ou mudar a categoria, o progresso é recalculado; bonificações já registradas mudam de status em vez de serem apagadas.
- Status da bonificação: pendente, aprovada, paga, cancelada.

### 3. Notificações
- Ao atingir uma meta, o corretor recebe uma notificação (visível no menu Agenciamentos) com categoria, meta atingida, progresso, data e aviso de que a bonificação está pendente de processamento.
- Ricardo e Bruna (resolvidos pelo papel `admin`) recebem notificação com corretor, categoria, meta, totais, data, status e link direto para o painel do corretor.
- A chave de deduplicação impede notificações repetidas em recálculos ou recarregamentos.

### 4. Interface Agenciamentos
- Seletor segmentado no topo: **Venda** / **Aluguel** (mesmo padrão visual do seletor de trilhas de Atendimentos), com contadores próprios.
- KPIs e filtros independentes por categoria.
- Painel de meta de venda: agenciamentos no mês, com placa, quantos faltam de cada, nível atual e próxima meta.
- Painel de aluguel: total acumulado, bonificações conquistadas, saldo atual e quantos faltam para a próxima.
- Histórico de bonificações com estados (conquistada, pendente, aprovada, paga).
- Estados de carregamento, vazio, erro e dados parciais; layout responsivo, foco visível, navegação por teclado e alvos de toque adequados; animação sutil apenas quando o progresso muda.

### 5. Menu Corretores
- No card e no painel detalhado de cada corretor: agenciamentos de venda no mês, placas instaladas, bonificações de venda do mês, acumulado de aluguel, bonificações de aluguel, total pendente e histórico com status.
- Indicador visual quando há bonificação pendente, com atalho para os detalhes.

## Detalhes técnicos

- Migração: `ALTER TABLE public.agenciamentos ADD COLUMN finalidade text CHECK (finalidade IN ('venda','aluguel'))` + índice `(corretor_id, finalidade, data_agenciamento)`.
- Nova tabela `agenciamento_bonuses` (corretor_id, categoria, nivel, periodo_ref, meta_num, listings_count, placas_count, achieved_at, status) com `UNIQUE (corretor_id, categoria, periodo_ref, nivel)`, GRANTs para `authenticated`/`service_role`, RLS: corretor lê as próprias, admin/secretaria leem e gerenciam todas.
- Função `SECURITY DEFINER` `recalc_agenciamento_bonuses(_broker uuid)` calculando venda por `date_trunc('month', data_agenciamento)` e aluguel cumulativo, com `INSERT ... ON CONFLICT DO NOTHING` (idempotente) e recálculo disparado por trigger em INSERT/UPDATE/DELETE de `agenciamentos`.
- Notificações inseridas dentro da mesma função, com `dedup_key` derivado da bonificação; destinatários admin resolvidos via `user_roles`, respeitando `has_notification_agency_access`.
- Frontend: `src/lib/agenciamentos/track.ts` (novo, espelhando `atendimentos/track.ts`), `AgenciamentoTrackSelector.tsx`, `AgenciamentoBonusPanel.tsx`, ajustes em `AgenciamentoFormModal.tsx`, `AgenciamentoSummaryCards.tsx`, `AgenciamentoFilters.tsx`, `_app.agenciamentos.tsx`, `useAgenciamentos.ts`, `services/agenciamentos.ts`, `types/agenciamento.ts` e nos componentes de Corretores.
- Rotas, RLS existentes, CRUD e fluxos atuais permanecem; nenhuma rota nova é criada (a categoria vira parâmetro de busca na rota atual).
