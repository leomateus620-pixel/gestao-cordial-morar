# Aluguel x venda — dados reais de atendimentos, filtros em ícone e troca de posição

O gráfico "Aluguel x venda" hoje usa dados de exemplo (`dashboardAluguelVenda`) com meses fixos Jan–Jun. Ele passa a comparar **atendimentos de aluguel x atendimentos de venda**, sobe para o topo do painel e o "Resumo previsto" financeiro desce para o lugar dele.

## Dados

- Fonte única: **Atendimentos** (mesmo cache dos menus, atualiza sozinho ao criar/editar). Nada vem de Aluguéis ou Vendas.
- Classificação por trilha: finalidade `aluguel` = Aluguel (laranja), `compra` = Venda (azul). `ambos` fica de fora.
- Agrupamento por data de criação do atendimento, respeitando a imobiliária selecionada.

## Filtros (um único ícone expansivo)

- Botão de ícone (sliders) no canto do cabeçalho — popover no desktop, sheet no mobile, mesmo padrão dos outros cards do painel.
- Períodos: **Mês** (por dia/semana do mês corrente), **Ano** (por mês) e **Personalizado** (intervalo de datas).
- Marcador discreto no ícone quando o filtro sai do padrão.

## Visual

- Título "Aluguel x venda" em destaque tipográfico, com rótulo curto do período à direita; sem subtítulos ou frases explicativas.
- Duas barras por período, laranja (Aluguel) e azul (Venda), cor sólida, cantos arredondados, sem gradientes; grid e eixo Y removidos, eixo X com rótulos compactos.
- Acima do gráfico, uma faixa de leitura direta: total de **Aluguéis**, total de **Vendas** e a diferença/participação entre as duas — números grandes, tabulares, com o marcador de cor de cada série.
- Legenda reduzida a dois marcadores discretos; tooltip compacto com os dois valores.
- Estados de carregando, erro e vazio no mesmo padrão dos demais cards.

## Reposicionamento

- O card "Aluguel x venda" passa a ocupar a linha superior, ao lado dos indicadores, no espaço hoje do "Resumo previsto".
- O "Resumo previsto" financeiro desce para a linha de gráficos, junto de Evolução de atendimentos e Origem dos leads, mantendo conteúdo e cálculo atuais.

## Detalhes técnicos

- Novo `src/components/dashboard/RentalVsSaleCard.tsx` (apresentação + filtros) e novo hook `src/hooks/useRentalVsSale.ts` derivando as séries de `useAttendances("", defaultAtendimentoFilters)` com `matchesTrack` e `useMemo`.
- `src/routes/_app.index.tsx`: remove o `ChartCard` de "Aluguel x venda" e o import de `dashboardAluguelVenda`; troca a ordem entre `FinancialSummaryCard` e o novo card.
- Cores de `@/lib/chart-palette` (`chartMorar` para aluguel, `chartCordial` para venda); `Popover`/`Sheet` + `useIsMobile()` para os filtros. Sem mudanças em serviços, hooks de vendas/aluguéis ou banco.
