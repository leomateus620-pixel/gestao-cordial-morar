# Inteligência dos imóveis — novo painel no Painel Geral

Substitui o card "Comparativo das operações" (hoje 100% mock) por uma análise real do portfólio Cordial/Morar, no mesmo lugar, mesma largura e mesma linguagem visual.

## Mapa de impacto (auditoria)

- O card atual está inline em `src/routes/_app.index.tsx` (`ComparativoCard`) e lê `dashboardComparativoCordialMorar` de `src/lib/mock/data.ts` — conversão, receita prevista, Instagram/Indicação. Tudo isso sai.
- Fonte real: tabela `properties` (811 registros, 0 arquivados, 0 rascunhos) + `property_provider_publications` (790 imóveis vinculados, status `published`/`out_of_sync`). A view `properties_catalog` já resolve `providers[]` e `publication_statuses[]` por imóvel — será reaproveitada.
- Operação: coluna `operacao` com `venda` (726) e `aluguel` (85); um imóvel tem uma operação só, então não há dupla contagem por operação hoje — a regra de dedupe fica implementada mesmo assim.
- Hoje nenhum imóvel está publicado nos dois sites (interseção = 0). O filtro "Publicado nos dois" existe e mostrará o estado vazio correto enquanto isso for verdade.
- Bairro: 77 valores distintos, 20 sem bairro. `regiao`/`zona` estão vazias — a dimensão será `bairro`.
- Valor: 57 imóveis sem valor e 36 com `valor_modo = consulte` — ficam fora de ranking e média.
- Gráficos: Recharts + paleta `src/lib/chart-palette.ts` (azul Cordial, laranja Morar) — reutilizados.
- O card vizinho `RentalVsSaleCard` usa **atendimentos**, não imóveis: não há duplicação de informação.

## Decisões confirmadas

- Escopo padrão: somente imóveis com vínculo ativo em algum site (790).
- Bairros e loteamentos ficam **separados** no ranking, exatamente como cadastrados (ex.: "Cruzeiro" e "Cruzeiro · Loteamento Esplanada" são linhas distintas). A normalização serve só para unificar variações equivalentes (maiúsculas, acentos, espaços duplos, prefixo "Bairro ").

## O que será construído

**Cabeçalho** — eyebrow `CORDIAL × MORAR`, título "Inteligência dos imóveis", subtítulo dinâmico ("Portfólio combinado · 790 imóveis"), botão só de ícone de filtros com badge quando houver recorte ativo, e até dois chips removíveis abaixo do título.

**Indicadores (4)** — Imóveis (total único), Venda, Aluguel, Maior concentração (bairro líder + %).

**Ranking de regiões (≈60%)** — barras horizontais, Top 6 no desktop / Top 5 no mobile, com posição, nome, quantidade, percentual e barra proporcional. Tooltip com total, Venda, Aluguel, Cordial, Morar e publicados nos dois. Clique/Enter abre `/imoveis` já filtrado por bairro + recorte atual. "Não informado" nunca ocupa posição no Top; vira indicador discreto de qualidade.

**Top 5 valores (≈40%)** — posição, valor em BRL, tipo, bairro, códigos Cordial/Morar, chip Venda/Aluguel, ponto colorido do provedor e clique para a ficha. Listas de Venda e Aluguel **nunca** se misturam: com os dois selecionados aparece uma alternância compacta Venda | Aluguel, lembrada durante a sessão. Consulte, nulo e zero ficam fora.

**Insights (até 3)** — determinísticos, curtos e numéricos (concentração do bairro líder, participação de Venda, diferença Cordial × Morar no bairro líder, imóveis sem bairro). Seção some quando não houver insight sustentado.

**Filtros por ícone** — popover no desktop, bottom sheet no mobile. Imobiliária: Portfólio combinado / Cordial / Morar / Publicado nos dois (interseção). Operação: Venda e aluguel / Venda / Aluguel. Aplicar, limpar e cancelar sem perder estado; recorte refletido em todos os blocos.

**Estados** — skeleton com as mesmas dimensões, vazio com "Limpar filtros", erro curto com "Tentar novamente".

## Detalhes técnicos

- Nova função SQL `get_property_portfolio_analytics(provider_filter text, operation_filter text)` (SECURITY INVOKER, respeitando RLS de `properties`), retornando um único JSON com `summary`, `regions`, `topValues.sale`, `topValues.rental` e contagens para insights. Dedupe pelo UUID local via `EXISTS` sobre `property_provider_publications`; nunca soma Cordial + Morar.
- Normalização de bairro em SQL: `unaccent`+`lower`, colapso de espaços, remoção do prefixo "Bairro ", separador de loteamento padronizado; label amigável preservado via `min(bairro)`.
- Índices de apoio: `property_provider_publications(property_id, provider, status)` e `properties(operacao, valor)` parcial para não nulos.
- Server function tipada `getPropertyPortfolioAnalytics` em `src/lib/imoveis/portfolio.functions.ts` + hook `usePropertyPortfolioAnalytics` com React Query (`staleTime` curto, `placeholderData`, cancelamento automático ao trocar filtro) e invalidação junto das chaves `imoveis` já existentes.
- Componentes novos em `src/components/dashboard/`: `PropertyIntelligenceCard.tsx`, `PortfolioRegionChart.tsx`, `PortfolioTopValues.tsx`, `PortfolioFilterButton.tsx`.
- Remoção de `dashboardComparativoCordialMorar` de `src/lib/mock/data.ts`, do `ComparativoCard` e dos imports órfãos em `_app.index.tsx`.
- Testes: unitários de normalização e de montagem de insights, testes de consulta cobrindo dedupe, interseção, separação Venda/Aluguel, exclusão de Consulte/nulo/zero e denominador dos percentuais; verificação E2E de responsividade, navegação por clique e teclado. Lint, typecheck e build.
