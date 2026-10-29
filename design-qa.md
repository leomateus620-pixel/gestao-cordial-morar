# Google Ads — revisão de design

**final result: passed**

A implementação foi comparada visualmente com a referência fornecida, com a versão anterior dos componentes e com a Meta. Não restam achados P0, P1 ou P2. Product Design orientou a composição e a revisão; a implementação foi feita no repositório existente.

## Fontes e evidências

- Fonte visual: `/Users/leonardo/Downloads/Redesign premium do painel Google Ads.png` (1558 × 1010 px). Inspiração de composição; números e curvas não foram usados como dados.
- Estado anterior fornecido: as duas capturas de 29/10/2026, às 01:20:54 e 01:22:01.
- Antes executável: `GoogleMarketingView.tsx` do HEAD original, servido temporariamente com o mesmo transporte de testes da versão nova.
- Implementação: `tests/marketing/preview.html`, com os componentes reais e transporte isolado explicitamente identificado como sintético. Não houve acesso ou alteração no banco.
- Comparação conjunta da referência e implementação: [comparison-reference.jpg](docs/evidence/google-ads-refinement/comparison-reference.jpg).
- Comparação conjunta antes/depois: [comparison-before-after.jpg](docs/evidence/google-ads-refinement/comparison-before-after.jpg).
- Capturas completas: [1440](docs/evidence/google-ads-refinement/after-1440.jpg), [1280](docs/evidence/google-ads-refinement/after-1280.jpg), [768](docs/evidence/google-ads-refinement/after-768.jpg), [360](docs/evidence/google-ads-refinement/after-360.jpg).
- Foco/tooltip com duas métricas: [desktop](docs/evidence/google-ads-refinement/two-metrics-interaction-1440.jpg) e [toque em 360](docs/evidence/google-ads-refinement/touch-360.jpg).
- Menus: [seletor aberto](docs/evidence/google-ads-refinement/select-open-1440.jpg), [informações em 360](docs/evidence/google-ads-refinement/data-info-360.jpg), [colunas em 360](docs/evidence/google-ads-refinement/columns-open-360.jpg).
- Estados: [sem coleta](docs/evidence/google-ads-refinement/empty-360.jpg), [lacunas internas](docs/evidence/google-ads-refinement/gaps-1440.jpg), [mês incompleto](docs/evidence/google-ads-refinement/month-with-gaps-1440.jpg), [carregamento](docs/evidence/google-ads-refinement/loading-1440.jpg).

## Dimensões e estado comparados

Antes/depois usam viewport de **1440 × 1080 CSS px**, densidade 1, mesmo período (01–28 out. 2026), conta, três campanhas e dados sintéticos. As capturas completas têm alturas diferentes, pois a tabela foi compactada. O recorte de conteúdo começa em x=24/y=340, com largura de 1392 px. Os painéis comparativos normalizam ambos para 760 px por coluna sem alterar conteúdo.

A referência não tem shell e contém uma linha de campanha, outros valores e outro período. Foi redimensionada proporcionalmente à mesma largura do recorte, sem tratar essas diferenças de conteúdo como defeitos. A referência é inspiração, não contrato de reprodução literal.

As quatro larguras também foram medidas no navegador: `scrollWidth === innerWidth` em 360, 768, 1280 e 1440. Os quatro indicadores têm 116 px de altura. Os controles de evolução têm 36 px no desktop e 44 px no celular. A plotagem tem 290/260 px. As medições estão em [browser-measurements.json](docs/evidence/google-ads-refinement/browser-measurements.json).

O navegador interno foi usado na revisão inicial. Como não oferece despacho de toque, o Chrome disponível foi usado para a validação de toque emulado, capturas finais e comparação normalizada com densidade 1. Não foi usado Playwright CLI. Nenhum teste foi realizado em aparelho físico.

## Superfícies verificadas

| Superfície | Resultado |
| --- | --- |
| Tipografia | Manrope existente, carregada na prévia pelo arquivo local já disponível. Rótulos dos indicadores 13 px, valores 28 px no desktop, semibold e tabulares; títulos locais da mesma família. Nenhuma fonte global alterada. |
| Ritmo e composição | Indicadores alinhados; raio de 12 px, espaçamento em 4/8 px e elevação suave. Controles próximos ao título e agrupados à esquerda. A tabela elimina as repetições de conta/cobertura por linha. |
| Cores e tokens | Superfícies neutras opacas, bordas leves, azul da série e cobre da comparação. Tokens `gads-*` locais também acompanham portais. Foco visível e legível; nenhuma alteração em CSS da Meta. |
| Ativos e ícones | Ícones Lucide existentes, 17 px em fundos de 30 px. Custo/conversão usa símbolo monetário. Nenhuma ilustração, imagem decorativa, biblioteca ou fonte nova. O gráfico continua em Recharts. |
| Conteúdo | Textos técnicos saíram da apresentação permanente e estão no popover. “Dados parciais”, “Sem dados no período”, “Sem coleta” e “Hoje em andamento” permanecem contextuais. Null continua traço e zero real continua zero. |

## Interações e integridade

- Seletores Radix abrem com o mesmo acabamento, permitem navegação por teclado e fecham com Escape. Foco retorna ao controle.
- Quatro indicadores continuam personalizáveis sem duplicar métricas selecionadas.
- Primeira/segunda métrica, opção Nenhuma e Dia/Semana/Mês funcionam. Selecionar na primeira uma métrica já usada na segunda limpa a comparação.
- Duas séries usam eixos independentes, moeda/percentual nos ticks e legenda com lado da escala. Conversões fracionárias não são arredondadas para ticks inteiros repetidos.
- Linhas lineares, sem animação de curva ou conexão de nulls. Grade apenas horizontal. Tooltip com data, nome, valor exato formatado e linha-guia; consulta por setas, ponteiro e toque emulado. Tooltip móvel medido dentro da tela.
- “Ver tabela” apresenta todos os dias, incluindo os traços das lacunas. Não é preciso depender do gráfico para consultar valores.
- Lacunas iniciais e internas continuam vazias. Semana/mês incompletos não viram totais inventados. Dia atual é reconhecido pelo fuso da conta e continua parcial; valor zero observado não é removido.
- Nomes extensos usam duas linhas e nome completo no detalhamento/title. Status pequenos informam a origem Gestão. Personalização de colunas, restauração e rolagem por teclado funcionam; o restante da página não transborda.
- Contador e resumo usam `data.total`/`data.summary`. Ordenação e paginação continuam na RPC autorizada, antes de LIMIT/OFFSET. Não houve soma ou ordenação local apenas da página.
- Seletor duplicado de plataforma removido do card Marketing, inclusive do painel móvel, conforme complemento do pedido. O switch superior permanece. URLs legadas `manual`/todas e registro manual no menu continuam válidos; não foi criado um terceiro switch.
- Atualização em segundo plano usa espaço reservado para indicador discreto. Skeleton Google corresponde à estrutura de quatro KPIs, gráfico e tabela. Estados de erro continuam contextualizados, incluindo data de coleta e tentativa novamente.
- Movimento reduzido respeitado; curvas não animam. `initialDimension` evita a dimensão inicial negativa do gráfico Google antes da medição.

## Histórico de correções visuais

1. **P2 — risco de layout deslocado no carregamento.** O skeleton genérico antigo tinha outra quantidade de indicadores, e o texto de atualização entrava/saía da página. Corrigido com skeleton Google e indicador de atualização em espaço reservado. Evidência: `loading-1440.jpg` e alturas medidas iguais nos KPIs/plotagem.
2. **P2 — popover móvel com topo cortado ao abrir após rolar o gráfico.** Ajustado com margem de colisão, altura disponível e rolagem interna. Na nova medição em 360 × 900, o painel ocupa x=12…348 e y=480…888. Evidência: `data-info-360.jpg`.
3. **P2 — foco automático do SVG por toque gerava contorno laranja em uma camada interna.** Removido apenas para camadas programáticas de tabindex=-1; o ponto de entrada por teclado mantém contorno visível. Evidência revisada: `touch-360.jpg` e `two-metrics-interaction-1440.jpg`.
4. **P2 — ticks de conversões poderiam ter rótulos inteiros repetidos.** Formatter aceita até duas casas para conversões. Precisão e razões continuam calculadas pelos helpers exatos.
5. **P2 — prévia usava fallback de fonte.** A prévia passou a carregar a Manrope local existente. Capturas finais e comparação foram refeitas com a fonte carregada.
6. Revisão independente final dos painéis conjuntos, captura móvel, desktop em interação e toque: sem P0/P1/P2 acionável.

## Meta e verificações técnicas

A área analítica da Meta não foi editada. As capturas [antes](docs/evidence/google-ads-refinement/meta-before-1440.jpg) e [depois](docs/evidence/google-ads-refinement/meta-after-1440.jpg), na mesma fixture/período, são **idênticas pixel a pixel**. Esse comparativo já usa a remoção intencional do seletor duplicado no cabeçalho compartilhado em ambos os lados. A troca do gráfico de Leads para Cliques e o switch Meta/Google foram exercitados, preservando o período.

346 testes aprovados (275 Vitest + 71 Ads/SQL), typecheck e build aprovados; ESLint sem erros, com o aviso preexistente de export de `collectionTimestamp`. Foram repetidos 22 testes dos componentes Google depois dos últimos ajustes. Console verificado: sem erros da aplicação; avisos antigos de medição de montagem do Recharts apareceram na versão anterior/Meta e o gráfico Google recebeu dimensão inicial válida. Resumo em [checks.txt](docs/evidence/google-ads-refinement/checks.txt).

## Limites e próximo passo

As evidências exercitam componentes reais com dados sintéticos isolados e identificados. Produção continua consumindo exclusivamente a RPC real existente; nenhuma fixture foi conectada ao app publicado. A validação não incluiu login na produção, alteração no banco ou aparelho físico. A publicação desta entrega é uma PR; não houve merge ou deploy por esta tarefa.

P3 opcional: uma pista visual de rolagem horizontal pode melhorar a descoberta das demais métricas no celular. A rolagem interna e a personalização já funcionam e cumprem o escopo.

**final result: passed**
