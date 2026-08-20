# Gráfico da equipe — layout clean, barras próprias e filtros em ícone

Refinar o card "Performance da equipe" (Atendimentos, contratos e agenciamentos) na visão geral, priorizando leitura dos dados e identidade visual própria, sem mudar cálculos nem fontes de dados.

## O que muda

1. **Cabeçalho com destaque tipográfico**
   - "Atendimentos, contratos e agenciamentos" vira o elemento dominante do card: tamanho maior, peso alto, tracking negativo e uma marcação de destaque (as três palavras-chave ganham cor de série própria, com um filete de acento à esquerda no lugar do selo genérico).
   - Remove o subtítulo explicativo longo e o chip "Performance da equipe"; sobra um rótulo curto de contexto (período ativo) alinhado à direita.

2. **Filtros como ícone expansivo**
   - O grupo de períodos (Mês / 30 dias / Trimestre / Ano) e os toggles de séries saem do topo e do rodapé e passam para um único botão de ícone (sliders) no canto do cabeçalho.
   - Ao abrir: popover no desktop, sheet inferior no mobile, com período e visibilidade das séries em um só lugar. O botão mostra um marcador quando o filtro está diferente do padrão.
   - O rodapé com a legenda de olhinhos/"Todos" é eliminado; a legenda vira apenas três marcadores discretos de cor + rótulo, não clicáveis.

3. **Barras personalizadas**
   - Barras horizontais com trilho de fundo (track) fino, cantos totalmente arredondados, altura consistente e espaçamento maior entre corretores.
   - Fim dos gradientes translúcidos genéricos: cor sólida por série com apenas a linha do líder em intensidade cheia e as demais levemente atenuadas.
   - Valor no fim da barra em fonte tabular compacta; eixo X e grid removidos (o track já dá a escala), eixo Y com o primeiro nome em caixa e peso próprios.
   - Nome do corretor à esquerda em coluna fixa e alinhada, evitando o serrilhado atual de larguras.

4. **Menos poluição**
   - Cards-resumo de topo passam a uma faixa única de três números (rótulo curto + valor), sem barrinha de participação nem descrições secundárias.
   - Remove a frase "X lidera em ... no período selecionado" e o selo "Top do período": a liderança é comunicada pela própria barra em destaque com uma marca discreta.
   - Sombras, blur e bordas suavizados para um cartão mais plano e limpo, com um único nível de elevação.

5. **Responsividade**
   - Mobile: cabeçalho em duas linhas (título + ícone de filtro), resumo em três colunas compactas, coluna de nomes reduzida, alturas de barra menores e legenda em linha rolável.
   - Desktop: aproveitamento total da largura, título e filtro na mesma linha, gráfico ocupando a área livre com altura proporcional ao número de corretores.

## Detalhes técnicos

- Alterações restritas a `src/components/dashboard/TeamPerformanceChart.tsx` (apresentação). Nenhuma mudança em `equipe.functions.ts`, hooks ou serviços.
- As barras deixam de usar `CartesianGrid`/`XAxis` e passam a `Bar` com `background` (track) e `Cell` para o realce do líder; `LabelList` com `position="right"` mantido, tipografia em `tabular-nums`.
- Filtros expansivos reutilizam `Popover` e `Sheet` de `@/components/ui` com `useIsMobile()`, mesmo padrão já usado em `CorretoresFilters.tsx`.
- Cores continuam vindo de `@/lib/chart-palette`; nenhum hex solto novo em componente.
- Estados de carregando, erro e vazio preservados, apenas re-estilizados no novo padrão.
