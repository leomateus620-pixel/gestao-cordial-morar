# QA — indicadores da visão geral

final result: passed

Relatório anterior preservado em [QA Morar](docs/qa/morar-charcoal/design-qa.md).

## Escopo e referências

Redesign dos cinco cards reais de `DashboardMetricCards`, sem alterar o restante da visão geral. A prévia usa o mesmo componente de produção, com o transporte substituído por dados fictícios determinísticos, sem conexão ao CRM. Não foi validada uma sessão autenticada em produção.

- Fonte visual: `/Users/leonardo/Desktop/Captura de Tela 2026-11-15 às 10.08.15.png` (2666 × 1440).
- Refinamento solicitado durante a implementação: `/Users/leonardo/Desktop/Captura de Tela 2026-11-15 às 10.35.08.png` (616 × 870): remover descrições e compactar os filtros.
- Inspiração consultada: https://github.com/dickwu/apple-design-skill/blob/main/SKILL.md e orientações oficiais de tipografia e gráficos da Apple. Mantidos Manrope/Sora, os ícones Lucide e a identidade do produto.
- Implementação desktop: `docs/evidence/dashboard/cards-desktop.png`, 1333 × 720; filtro: `filter-desktop.png`, mesma dimensão.
- Normalização: primeira fonte reduzida em 50% a 1333 × 720; implementação capturada nessa largura CSS, imagem de 1333 × 720 (1 pixel por pixel CSS). A densidade original da fonte não foi inferida como configuração real do navegador.
- Comparação em conjunto: `/tmp/dashboard-qa/full-comparison.png`, `/tmp/dashboard-qa/cards-comparison.png` e `/tmp/dashboard-qa/filter-comparison.png`. As fontes com dados do usuário não foram copiadas para o repositório.
- A comparação do filtro usa o recorte do novo popover com 304 × 377; a segunda fonte foi normalizada para comparação de composição, sem assumir sua densidade original.

## Comparação e iterações

1. P2: versão inicial alta demais, com período abaixo de toda a linha do ícone. Período foi agrupado ao título, mantendo os ícones com 44 × 44. A faixa inferior acomoda as barras reais; o aumento de altura em relação à fonte é intencional para acrescentar gráficos e filtros.
2. P2: tabela acessível diretamente com `sr-only` ainda produzia 4 px de overflow horizontal pela largura intrínseca da tabela. Corrigido com contêiner visualmente oculto. Largura de documento igual à viewport, confirmada em 320, 390, 768 e 1333 px.
3. Feedback do usuário: removidos o texto explicativo e o título redundante do filtro, atalhos em três colunas, ações lado a lado e espaçamentos menores. Popover final 304 × 377 no desktop, sem rolagem a 1333 × 720. Recapturado em `filter-desktop.png`, `filter-detail.png` e `filter-mobile.png`.

## Superfícies verificadas

- Tipografia: famílias existentes, títulos em caixa normal, números tabulares com Sora, hierarquia mais clara, sem truncar títulos/períodos. Textos de apoio e controles usam os tokens de contraste do produto.
- Layout: cinco colunas quando há espaço útil suficiente; três no tablet; uma no celular de 390 e na largura mínima de 320. Sem sobreposição ou rolagem lateral. Raio, bordas e sombras discretas coerentes com o painel.
- Cores: mantidas as cinco associações de cor; rótulos, números e seleção marcada complementam a cor. Tema escuro inspecionado em `cards-dark.png`. Sem depender de cor para transmitir contagem ou seleção.
- Assets: ícones Lucide já usados pelo produto, sem novos assets raster. Gráficos construídos com Recharts. Nenhum ícone/ilustração substituído por desenho improvisado.
- Conteúdo: nomes dos indicadores preservados, período explícito; `Novos clientes` mantém o critério existente de etapa de fechamento. Aluguel/compra filtram a entrada dos atendimentos ativos hoje, não simulam uma série histórica de estoque.

## Interações verificadas no navegador integrado

- Mês anterior altera somente o próprio card; mês personalizado (`out. de 2026`); intervalo personalizado inclusivo; datas invertidas produzem mensagem e não aplicam; restauração do padrão.
- Popover aberto com Enter, fechado com Escape, foco devolvido ao ícone; gráfico explorável com setas e tooltip; tabela acessível mantém os valores disponíveis.
- Link de aluguel preserva `track=aluguel` e chega ao destino da prévia. Rotas finais continuam as rotas existentes do aplicativo.
- Estados sem registros, carregamento, falha isolada da agenda e recuperação via botão. Falha da agenda não apaga os quatro indicadores de atendimentos.
- Viewports: 1333 × 720, 768 × 1024, 390 × 844 e 320 × 740. Popover permanece dentro da viewport, inclusive a 320 px.
- Console do navegador: sem erros ou avisos durante a verificação.
- Redução de movimento e de transparência implementadas em CSS; não foi simulado um dispositivo físico com leitor de tela.

## Validação técnica

19 testes de regras de período e paginação passaram. Typecheck, lint dos arquivos novos/alterados do painel e build de produção passaram. A paginação da agenda reutiliza o helper de leitura integral já testado; autenticação, RLS, ordenação estável e filtro de escopo continuam no servidor.

Nenhum P0/P1/P2 pendente no escopo verificado. A prévia é isolada: dados e navegação de destino são de demonstração, enquanto os cards e suas interações são os componentes reais.
