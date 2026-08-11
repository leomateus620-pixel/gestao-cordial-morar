# Cards do Painel com dados reais e visual mais claro

Hoje os cards do topo do Painel são calculados a partir do store local de exemplo (`app-store`), com mês fixo em "2026-06". Por isso aparecem zerados. A proposta é ligá-los aos dados reais dos módulos e reduzir para 5 cards úteis.

## Cards finais (5)

| Card | Origem real | Cálculo |
| --- | --- | --- |
| Atendimentos do mês | Atendimentos | atendimentos criados no mês corrente (data real do sistema), com comparativo automático vs. mês anterior |
| Novos clientes | Atendimentos | atendimentos que estão na etapa **Fechamento** do funil, entrados no mês corrente |
| Buscando aluguel | Atendimentos (trilha Aluguel) | atendimentos ativos na trilha de aluguel |
| Buscando compra | Atendimentos (trilha Venda) | atendimentos ativos na trilha de venda |
| Visitas agendadas | Agenda | eventos do tipo Visita, ainda não concluídos/cancelados, de hoje em diante |

Removidos: **Imóveis em negociação**, **Cobranças em aberto** e **Inadimplência**.

## Atualização automática

Os cards passam a usar os mesmos hooks de nuvem dos menus (`useAttendances`, `useAgenda`). Ao cadastrar/editar um atendimento ou um evento, o cache é invalidado e os números se atualizam sozinhos, sem recarregar a página. Enquanto os dados carregam, os cards mostram um estado de carregamento discreto em vez de "00".

## Visual

- Grade de 5 cards: 2 colunas no celular, 3 em tablet, 5 no desktop (sem carrossel/paginação).
- Cada card: rótulo em caixa alta discreto, número grande e tabular, ícone em círculo suave com cor por tema (atendimentos, clientes, aluguel, compra, agenda) e uma linha de contexto (ex.: "+3 vs. mês anterior", "aguardando fechamento").
- Card inteiro clicável, levando ao menu de origem (Atendimentos com a trilha correspondente, ou Agenda) — com foco visível e hover sutil, mantendo o estilo clean/glass já usado no sistema.
- Variação percentual/absoluta só aparece quando existe base de comparação, evitando números inventados.

## Detalhes técnicos

- Novo hook `src/hooks/useDashboardMetrics.ts`: consome `useAttendances("", defaultAtendimentoFilters)` e `useAgenda("", defaultAgendaFilters)` e deriva as 5 métricas com `useMemo`, usando `FUNNEL_PIPELINE_STAGES`/`ACTIVE_PIPELINE_STAGES` e `matchesTrack` (`@/lib/atendimentos/track`).
- Novo componente `src/components/dashboard/DashboardMetricCards.tsx` com o novo visual e estados de carregamento/erro.
- `src/routes/_app.index.tsx`: remove `metricGroups`, `MetricsCarousel` e os cálculos mock (`imoveisNegociacao`, `cobrancasAbertas`, `inadimplencia` deixam de alimentar cards; o resumo financeiro existente mais abaixo permanece como está). Passa a renderizar `DashboardMetricCards`.
- Datas baseadas em `new Date()` (sem o mês fixo `"2026-06"`), respeitando o filtro de imobiliária já aplicado pelos hooks.
