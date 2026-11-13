# Campo "Código" (busca exata) na barra de filtros do catálogo

## Decisões
- **Código legado (`codigo`) não entra na comparação.** É sempre cópia de um dos códigos de marca; compará-lo só repetiria resultados. Sem caso real que o exija.
- **Código ativo pausa os outros filtros**, inclusive o filtro de sites da marca (`providers`) e a busca do topo (`q`). A marca escolhe só qual coluna de código comparar. Os filtros continuam na URL e voltam a valer quando o código é limpo.
- **Ativos e arquivados entram juntos.** O card ganha um selo "Arquivado" (hoje o card não mostra esse estado).
- **Forma do campo:** campo de texto dentro do rail, com a mesma altura, raio e cores dos chips, ícone `Hash` e marcador "Código". Fica em primeiro lugar no desktop e logo depois de "Filtros" no mobile. Escolhi o campo direto em vez de um chip com popover: é um toque a menos e o campo fica sempre visível.
- **Como aplicar:** Enter aplica na hora. Também aplica sozinho 400 ms depois que a pessoa para de digitar, se o valor for válido. O X e o Esc limpam. Usa `inputMode="numeric"`. Com valor inválido aparece "Digite apenas números" e nenhuma consulta é feita.
- **Outros chips com código ativo:** ficam atenuados (opacidade reduzida) e continuam clicáveis. Mexer em um deles só muda a URL e **não** limpa o código. O aviso deixa claro que esses filtros estão pausados. Proposta: limpar o código sem a pessoa pedir faria o resultado mudar de forma inesperada.
- **Aviso abaixo do rail:** "Buscando só pelo código 1442 · outros filtros pausados" (com marca: "código Cordial 1442" / "código Morar 1442").
- **Estado vazio:** "Nenhum imóvel com o código X" (ou "...código Morar X"), com botão "Limpar código".
- **Sugestão de outra marca:** vale o custo. Só roda quando a busca por marca volta vazia: é uma consulta extra de igualdade na outra coluna, com `head: true` e índice. Aparece "Existe com código Morar X: ver", que troca a marca na URL.
- **Sem migration:** já existem índices em `lower(codigo_*)`. Vou comparar com `eq` direto, e são só uns 900 imóveis. Se o plano de consulta não usar o índice, o custo continua desprezível. Não mexo em RLS nem em permissões.

## Arquivos
- `src/lib/imoveis/code-search.ts` (novo, puro):
  - `normalizePropertyCode(raw)`: tira espaços, um `#` inicial e zeros à esquerda; aceita de 1 a 8 dígitos, senão devolve `null`. "0" ou "000" também viram `null`.
  - `codeColumnsFor(carteira)`: cordial → `["codigo_cordial"]`; morar → `["codigo_morar"]`; todas/ambas → as duas.
  - `codeSearchLabel(code, carteira)`: monta o texto do aviso e do estado vazio.
- `src/lib/imoveis/filters.ts`:
  - `codigo: ""` em `CatalogFilters` e no padrão.
  - O parse aceita o valor só se normalizar e guarda a forma normalizada.
  - O serialize grava o código só quando tem valor.
  - `toListInput` repassa `codigo`.
  - `countActiveFilters` e `activeChips` passam a contar o código (chip "Código 1442").
- `src/lib/imoveis/imoveis.functions.ts` (`listImoveis`):
  - `codigo?: string | null` no input.
  - Se `normalizePropertyCode` der valor no servidor, a consulta ignora todos os filtros e o arquivamento e usa `eq` ou `or(codigo_cordial.eq.X,codigo_morar.eq.X)`. A página é forçada para 0.
  - Valor inválido não consulta nada e devolve lista vazia.
  - Continua usando `context.supabase` (nada de admin).
  - Campo extra opcional `otherBrandMatch` para a sugestão de outra marca.
- `src/components/imoveis/PropertyFilterBar.tsx`: novo `CodeFilterInput` no rail, chips atenuados quando o código está ativo, aviso abaixo do rail e "Limpar tudo" limpando o código.
- `src/components/imoveis/catalog/FilterChip.tsx`: se precisar, uma prop `muted` só visual.
- `src/routes/_app.imoveis.index.tsx`: estado vazio próprio com "Limpar código" e a sugestão, `summaryFor` levando o código em conta, e o reset limpando o código. `rememberCatalogSearch` já usa o serialize, então o código é preservado ao voltar da ficha.
- `src/components/imoveis/PropertyCatalogCard.tsx`: selo "Arquivado" quando `archivedAt` existe, nos cartões e na lista.
- `src/lib/imoveis/code-search.test.ts` (novo) e `filters.test.ts`, com o novo arquivo incluído no script `test` do package.json.

## Fora do escopo
Busca do topo, GlobalSearchBar e /busca ficam como estão. Sem alteração de dados, de RLS ou de permissões, e sem publicar.

## Testes (node:test)
- `normalizePropertyCode`:
  - " 1442 " → 1442
  - "#1442" → 1442
  - "# 1442" → 1442
  - "01442" → 1442
  - "14a2" → null
  - "" → null
  - "0" → null
  - 9 dígitos → null
- `codeColumnsFor`: cordial, morar, todas e ambas.
- Parse e serialize: ida e volta com código; código inválido na URL é descartado; sem código, a URL não ganha o parâmetro.
- `toListInput` repassa o código; `countActiveFilters` e `activeChips` contam o código.
- Todos os testes atuais de filtros continuam passando.

## Validação
- Rodar `bun run test` (no mínimo os arquivos de imóveis), typecheck e lint dos arquivos alterados.
- Com Playwright em /imoveis, logado, desktop 1366 e mobile 390, cartões e lista:
  - "144" traz só o 144.
  - Marca Morar com um código Cordial mostra vazio com a sugestão de outra marca.
  - Um código arquivado aparece com o selo.
  - "14a" mostra o aviso e não dispara consulta.
  - Limpar o código faz os filtros anteriores voltarem a valer.
  - Voltar da ficha preserva o código.

## Riscos
- Algum card da lista pode não receber `archivedAt` no formato atual. Vou confirmar no mapeamento, que já existe.
- O debounce junto com o Enter pode disparar duas vezes. Fica uma única aplicação por valor.
- Se, no futuro, surgir código com zero à esquerda no banco, a normalização deixa de achá-lo. Hoje não existe nenhum caso assim.
