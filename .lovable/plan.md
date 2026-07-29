## Objetivo

No menu **Atendimentos** (trilhas Vendas e Aluguéis):

1. Cada card mostra a **última ação do histórico** daquele atendimento.
2. O funil ganha uma etapa **"Perdidos"**, com destaque visual vermelho tanto no card de etapa quanto nos atendimentos classificados como perdidos.

## O que será construído

### 1. Última ação no card

- A listagem de atendimentos passa a trazer, junto dos dados atuais, o registro mais recente do histórico de cada atendimento (tipo do evento, descrição, autor e data/hora). Isso é feito numa única consulta em lote — sem requisição extra por card.
- O card ganha uma faixa "Última ação" logo abaixo do bloco "Próxima ação", com:
  - rótulo legível do evento (ex.: "Etapa alterada", "Nova anotação", "Corretor vinculado", "Atendimento criado");
  - descrição resumida em até 2 linhas;
  - autor e horário relativo/absoluto à direita.
- Quando ainda não há histórico, exibe "Sem movimentações registradas".
- Responsivo: no mobile o bloco empilha rótulo/descrição e data; no desktop fica em duas colunas.

### 2. Etapa "Perdidos"

- O estágio `perdido` (já existente no modelo de dados) passa a ser uma etapa navegável do funil, ao lado das 5 atuais.
- **Cards de etapa (Etapas do funil):** entra um 6º card "Perdidos" com identidade vermelha forte (borda, fundo e número em tom rose/vermelho), diferente das etapas ativas, clicável como as demais.
- **Kanban desktop:** coluna "Perdidos" ao final, com cabeçalho vermelho e contagem.
- **Kanban mobile:** aba "Perdidos" na barra de etapas.
- **Card do atendimento perdido:** borda lateral e badge em vermelho sólido de alto contraste, e exibição do motivo da perda quando preenchido.
- **Classificação:** o seletor de etapa dentro do card passa a incluir "Perdido" (com estilo de alerta), permitindo marcar e também reverter para uma etapa ativa. A troca usa o fluxo de transição já existente (histórico + notificações continuam funcionando).
- O bloco "Resultados encerrados" deixa de duplicar os perdidos e passa a listar apenas arquivados.

## Detalhes técnicos

- `src/types/atendimento.ts`: novo tipo `AtendimentoUltimaAcao`, campo `ultimaAcao?` em `Atendimento`, helper `attendanceEventLabel()` e constante `FUNNEL_PIPELINE_STAGES = [...ACTIVE_PIPELINE_STAGES, "perdido"]` (mantendo `ACTIVE_PIPELINE_STAGES` intacto para as métricas de "ativos").
- `src/lib/attendances/attendances.functions.ts`: em `listAttendances`, além da consulta já existente de `stage_change`, uma consulta em lote a `attendance_history` (todos os tipos de evento, ordenada por `created_at desc`, com limite proporcional) reduzida ao registro mais recente por atendimento; `rowToAtendimento` recebe esse dado. Sem migração de banco — RLS de `attendance_history` continua sendo respeitada.
- `src/components/atendimentos/pipeline-ui.ts`: intensificar o preset `perdido` (badge vermelho sólido, coluna e dot em rose-600).
- `src/components/atendimentos/AtendimentoCard.tsx`: bloco "Última ação"; seletor de etapa usando `FUNNEL_PIPELINE_STAGES`; realce vermelho + motivo da perda quando `pipelineStage === "perdido"`.
- `src/components/atendimentos/AtendimentoKanban.tsx`: agrupamento e colunas/abas sobre `FUNNEL_PIPELINE_STAGES`; `TerminalResults` restrito a `arquivado`.
- `src/components/atendimentos/AtendimentoSummaryCards.tsx`: grid de 6 etapas (`lg:grid-cols-6`) com variante vermelha para "Perdidos"; contagem vem de `stats.pipeline.perdido`, que já é calculado.

Sem mudanças em permissões, RLS ou regras de negócio existentes.
