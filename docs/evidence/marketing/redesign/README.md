# Evidências — composição de Marketing

28/10/2026. Capturas reais do Browser interno executando os componentes do produto no harness de `tests/marketing`. Sessão, transporte, nomes e valores são **sintéticos**; o shell apenas reproduz a geometria existente. Não houve chamada à Meta ou publicação real.

## Antes e depois

| Recorte                                     | Antes                          | Depois                              |
| ------------------------------------------- | ------------------------------ | ----------------------------------- |
| Desktop, 1440 × 1000 CSS px, sidebar aberta | [Antes](before-shell-1440.jpg) | [Depois](after-shell-1440-open.jpg) |
| Celular, 390 × 844 CSS px                   | [Antes](before-shell-390.jpg)  | [Depois](after-shell-390-open.jpg)  |

O antes usa os arquivos de produção do commit `e8184a3b711bc83ea85eb4d6c55ce18c9bb94e52`, servidos por configuração temporária na porta 5180 com o harness sintético. O servidor e os arquivos temporários foram removidos depois da captura. O depois usa a implementação desta PR na porta 5179. O contexto principal é Cordial, outubro/2026, sem busca/status/conta aplicada. A data analítica do harness é fixada em 28/10/2026.

O shell inicial não continha busca operacional real; o final usa os controles reais integrados ao slot superior. Por isso, a medição abaixo compara somente a região **local de Marketing**, do título ao fim das abas/controles, sem incluir o cabeçalho global e o aviso sintético. A busca e o seletor Cordial/Morar do produto ocupam os slots que já existiam.

| Medição CSS                                             |    Antes |   Depois |         Diferença |
| ------------------------------------------------------- | -------: | -------: | ----------------: |
| Região local, desktop 1440, sidebar aberta              | 393,8 px | 181,8 px | −212,0 px (53,8%) |
| Distância entre início local e início dos KPIs, desktop | 449,8 px | 201,8 px |         −248,0 px |
| Região local, celular 390                               | 533,7 px | 185,8 px | −347,9 px (65,2%) |

Essas medidas descrevem espaço ocupado, sem inferir desempenho ou produtividade. A posição absoluta no celular também depende do cabeçalho global e do aviso da prévia.

## Matriz e estados

- `after-shell-{390,768,1280,1440,1920}-{open,closed}.jpg`: matriz final. A sidebar deixa de ser persistente abaixo do breakpoint existente. `viewport-measurements.json` registra `innerWidth`, `scrollWidth`, altura e posição dos controles: nenhuma rolagem horizontal da página e uma busca visível por viewport.
- `campaigns-long-1440.jpg`: nomes longos, tabela paginada em 25; a navegação para página 2 também foi exercitada.
- `comparison-1440.jpg`: série anterior real da fixture, tracejada; dias ausentes permanecem lacunas.
- `pending-1440.jpg`, `empty-1440.jpg`, `error-1440.jpg`, `invalid-period-1440.jpg`: fila, vazio, falha com resolução e intervalo inválido restaurado pela URL.
- `no-financial-1440.jpg`, `reviewer-1440.jpg`: composição sem valores financeiros. Autorização de produção é coberta pelos testes do servidor; estas imagens verificam apresentação.
- `leads-1440.jpg`, `leads-390.jpg`, `leads-deep-link-1440.jpg`: filtros acima das abas e contatos no corpo; entrada incompatível de Google é normalizada para Meta.
- `filters-390.jpg`: conta, plataforma, status e opções no painel acionado no topo do celular.
- `campaign-details-1440.jpg`: ficha, breadcrumb e seleção de nível; coleta externa não foi executada.
- `reports-queued-1440.jpg`: geração sintética na fila e download desabilitado; prévia permanece distinta do arquivo privado.
- `reference-match-1552.jpg`: comparação visual com a imagem fornecida, na dimensão de 1552 × 1013 CSS px, com adaptações intencionais à navegação do produto e às correções solicitadas depois.

O Browser interno iniciou com escala nativa 1,65. O viewport físico foi compensado para obter as larguras CSS solicitadas, verificadas por `innerWidth`; as imagens foram normalizadas para 1 pixel por CSS px. A captura de referência corresponde a 1552 × 1013. O teste `reflow-200.json` usa 720 CSS px exportados em 1440 px, equivalente ao reflow de uma janela de 1440 px a 200%. **Não é prova de zoom nativo de 200%**; a escala nativa do Browser foi preservada. Não houve overflow nesse cenário.

## Interações verificadas

Busca superior filtra campanhas e muda para contatos em Leads; há um único campo visível e nenhum seletor local de imobiliária. Todas/Cordial/Morar atualiza URL e resultados, limpa a conta e preserva os filtros compatíveis. Limpar a busca preserva a imobiliária. Status foi aplicado por pesquisa/Enter e removido pelo chip com foco restituído ao acionador.

Calendário permite edição sem alterar a URL, recusa intervalo invertido com erro localizado e aplica as duas datas juntas. Sheet de filtros, operações e ficha restituem foco; fechar a ficha conserva a rolagem observada. Operações não estão montadas antes da abertura e são desmontadas ao fechar. A seleção de nível consulta o nível solicitado sem coletar/publicar externamente. A métrica e o tooltip do gráfico foram exercitados por teclado com datas reais e unidade.

O console foi conferido em uma nova aba após os ajustes de HMR do harness: sem erros nos fluxos finais. O gráfico recebeu dimensão inicial positiva para evitar o aviso transitório do `ResponsiveContainer` antes do primeiro `ResizeObserver`. Isto não substitui uma auditoria completa de acessibilidade ou testes na sessão de produção.

## Checks

- Typecheck (`tsc --noEmit`): passou.
- Vitest Marketing: 33 arquivos, 224 testes passaram.
- Testes de anúncios/RLS/autorizações (`tsx --test tests/ads/*.test.ts`): 68 passaram.
- Testes de acesso, navegação e tokens da sidebar: 19 passaram.
- ESLint dos 14 arquivos de produto/helpers alterados em Marketing: passou.
- Build de produção Vite/Nitro: passou, com avisos de empacotamento existentes (chunks/dependências).
- `git diff --check`: passou.

Os testes não comprovam chamadas reais à Meta, emissão de PDF privado em produção ou autorização externa. Nenhuma dessas operações foi necessária para validar a composição.
