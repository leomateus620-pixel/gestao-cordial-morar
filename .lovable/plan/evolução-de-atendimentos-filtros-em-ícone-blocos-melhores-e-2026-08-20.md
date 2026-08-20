# Evolução de atendimentos — filtros em ícone, blocos melhores e gráfico com identidade

Refino visual e de leitura do card "Evolução mensal de atendimentos" na visão geral. Sem mudar a fonte de dados (atendimentos reais por data de criação) nem os cálculos de período.

## 1. Cabeçalho enxuto

- Título "Evolução de atendimentos" como elemento dominante, com filete de acento e rótulo curto do período ativo (ex.: "Este mês · 01/08 – 19/08").
- Removidos: o chip "Evolução comercial", a frase "Compare o crescimento da Cordial, Morar e total consolidado no período selecionado" e o bloco "Período dos dados" com os quatro botões soltos.

## 2. Filtros dentro de um ícone

- Um único botão de ícone (sliders) no canto do cabeçalho abre popover no desktop e sheet inferior no mobile.
- Dentro: período (Semana / Mês / Ano / Personalizado), campos de data inicial e final quando "Personalizado", e visibilidade das séries (Cordial / Morar / Total).
- O botão exibe um marcador quando o filtro está diferente do padrão; a legenda do rodapé vira apenas marcadores de cor não clicáveis.

## 3. Blocos de resumo mais intuitivos

Os quatro cartõezinhos truncados ("Total do…", "Maior pi…", "Melhor i…", "Período …") viram uma faixa de estatísticas consistente:

- Total de atendimentos no período (valor grande, tabular).
- Pico do período: valor + data do pico.
- Imobiliária líder: nome com cor da série + placar Cordial x Morar.
- Variação vs. período anterior: seta e percentual com cor semântica.

Rótulos curtos e completos (sem reticências), mesma altura, mesmo peso tipográfico, 2 colunas no mobile e 4 no desktop.

## 4. Gráfico com leitura mais forte

- Área empilhada suave para Cordial e Morar (gradiente próprio de cada marca) com a linha Total por cima em traço espesso e sólido — fim das três linhas finas indistinguíveis.
- Pontos ativos maiores, halo no hover, linha guia vertical ao passar o mouse e tooltip compacto com valor por série e total.
- Grid horizontal discreto apenas, eixo X com rótulos reduzidos (a cada N dias conforme largura) e eixo Y com poucos ticks; marcação do dia de pico.
- Realce por hover na legenda/série: a série focada fica em intensidade cheia e as outras atenuadas.
- Altura responsiva do gráfico e margens ajustadas para não cortar rótulos.

## 5. Responsividade

- Mobile: cabeçalho em duas linhas (título + ícone de filtro), resumo em 2 colunas, gráfico mais baixo, rótulos do eixo X espaçados.
- Desktop: título e filtro na mesma linha, gráfico ocupando toda a largura útil do bloco.

## Detalhes técnicos

- Mudanças restritas a `src/components/dashboard/AttendanceEvolutionCard.tsx` (apresentação e estado local de filtro). Sem alteração em hooks, funções de servidor ou consultas.
- `RechartsLineChart` passa a `ComposedChart` com `Area` (Cordial/Morar, `defs` de gradiente) + `Line` (Total); `CartesianGrid` só horizontal, `Tooltip` com `cursor` de linha guia.
- Filtros reutilizam `Popover` e `Sheet` de `@/components/ui` com `useIsMobile()`, mesmo padrão já aplicado em `LeadOriginCard` e `TeamPerformanceChart`.
- Cores continuam vindas de `@/lib/chart-palette` (`chartCordial`, `chartMorar`, `chartSystem`); nenhum hex novo em componente.
- Estados de carregando, erro e vazio preservados, apenas re-estilizados; `prefers-reduced-motion` continua respeitado.
- Verificação em navegador (desktop e mobile) de cada período, incluindo intervalo personalizado.
