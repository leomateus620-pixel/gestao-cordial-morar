## Objetivo

Criar uma "Fila de espera" no módulo Atendimentos: o corretor envia um atendimento para a fila pelo bloco "Operação" (ações do atendimento), o registro sai do funil principal e passa a ser acessível por um card dedicado exibido junto às etapas do funil, que só abre a lista quando clicado — igual ao comportamento atual de "Perdidos".

## Comportamento

1. **Enviar para a fila** — no card "Ações do atendimento" (drawer de detalhe), abaixo das ações atuais, um novo bloco "Fila de espera" com o botão **Colocar em espera** (tom âmbar, com ícone de pausa). Opcionalmente pede um motivo curto, registrado no histórico.
2. **Saída do funil** — ao entrar na fila, o atendimento deixa de aparecer nas colunas do Kanban, na lista e nas contagens das 5 etapas ativas; continua contando nos indicadores gerais (Compra/Aluguel/Leads do mês).
3. **Card de acesso** — junto às etapas do funil aparece um card "Fila de espera" com o total; clicando nele, o board principal é substituído por uma visão dedicada (mesma mecânica do card "Perdidos"), com botão "Voltar ao funil".
4. **Retorno ao funil** — dentro da fila, cada card permite escolher uma etapa ativa (ou botão "Retomar atendimento"), devolvendo o registro ao funil com status "em atendimento".
5. **Permissões** — mesmas regras já existentes: quem pode alterar etapa pode enviar/retirar da fila; corretor só age nos seus atendimentos.

## Detalhes técnicos

- **Banco**: `ALTER TYPE public.pipeline_stage ADD VALUE 'em_espera'` (migração). Nenhuma nova tabela ou política; RLS atual de `attendances` já cobre a mudança. `status` permanece `aguardando_retorno` quando em espera; o motivo vai para `attendance_history` via `attendance_add_note`.
- **Tipos** (`src/types/atendimento.ts`): adicionar `em_espera` a `PipelineStage` e a `pipelineStageOptions` ("Fila de espera" / "Em espera"); manter fora de `ACTIVE_PIPELINE_STAGES` e `FUNNEL_PIPELINE_STAGES`; novo helper `WAITING_PIPELINE_STAGE`.
- **UI tokens** (`pipeline-ui.ts`): paleta âmbar/stone para `em_espera`.
- **Cards de resumo** (`AtendimentoSummaryCards.tsx`): renderizar, ao lado das 6 etapas, o card "Fila de espera" com contagem vinda de `stats.pipeline.em_espera`.
- **Kanban** (`AtendimentoKanban.tsx`): novo `WaitingBoard` (espelhando `LostBoard`) exibido quando `selectedStage === "em_espera"`; itens em espera excluídos do agrupamento das colunas ativas.
- **Página** (`_app.atendimentos.tsx`): tratar `em_espera` em `handleStageChange` (reabertura limpa o estado de espera) e no cálculo de "ativos"; novo handler para colocar em espera.
- **Drawer** (`AtendimentoDetailDrawer.tsx`): bloco e botão descritos acima; quando já estiver em espera, o botão vira "Retomar atendimento".
- **Serviços/hook** (`services/atendimentos.ts`, `hooks/useAttendances.ts`, `attendance-field-mapping.ts`): mapear o novo valor na normalização de etapa/status e garantir que atendimentos em espera não sejam contados como atrasados nem como ativos, mas sigam visíveis por deep link e busca.
- **Regressões a validar**: contadores do seletor Venda/Aluguel, relatórios (`services/reports.ts`, `services/corretores.ts`) e a consulta da Agenda que exclui `perdido,arquivado` — passará a excluir também `em_espera`.
