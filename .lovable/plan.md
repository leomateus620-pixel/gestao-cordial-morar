# GTM da Cordial no topo do `<head>` do HTML servido

## Causa (confirmada)
- `package.json`: `react ^19.2.0`, `@tanstack/react-start 1.168.60`.
- `src/routes/__root.tsx` (linhas 152-167) já renderiza `<script data-gtm="cordial">` antes de `<HeadContent />` e o `<noscript>` no início do `<body>`.
- No SSR do React 19, `<meta>`, `<title>`, `<link rel=stylesheet|preload|modulepreload>` são *hoistables*: o Fizz os emite no início do `<head>`, antes dos filhos comuns. `<script>` inline com `dangerouslySetInnerHTML` (sem `async`+`src`) não é hoistable, então fica depois de todo esse lote. Isso explica o 63º de 65 em produção. Concordo: não é bug de `gtm-install.ts`, e mudar a ordem no JSX ou usar `head()` não resolve. Não encontrei outro mecanismo no projeto que reordene o `<head>`.

## Decisão do charset: opção B
`<meta charset>` continua como primeiro filho e o GTM vem logo depois, antes de viewport, preloads, CSS, title e demais metas.
Por quê: o charset tem que vir antes de qualquer conteúdo que o navegador precise decodificar, e o ideal é ele estar nos primeiros bytes. O snippet é ASCII e curto, então o GTM perde só uma tag de posição e continua antes de todo o resto. Assim respeitamos as duas recomendações sem depender da conta dos 1024 bytes.

## Arquivos
1. `src/lib/cordial-site/gtm-head-placement.ts` (novo, puro, sem DOM):
   - `placeCordialGtmAtHeadTop(html: string, opts?: { id?: string }): string`
   - Encontra o `<head ...>` e o `<meta charset...>`, se ele for o primeiro filho.
   - Localiza todos os `<script data-gtm="cordial" ...>…</script>` em `<head>`:
     - Se houver 1: remove de onde está e reinsere logo após o charset (ou logo após `<head>`, se não houver charset no início).
     - Se houver mais de 1: mantém só o primeiro e remove o restante (defesa contra duplicata).
     - Se houver 0 e `opts.id` passar em `isGtmId`: insere uma vez `<script data-gtm="cordial">${gtmHeadScript(id)}</script>`. Sem ID válido: não insere.
   - O noscript: se já for o primeiro filho do `<body>`, não muda. Se não houver noscript e houver ID válido, insere um logo após `<body>` com `gtmNoscriptSrc(id)`. Nunca duplica.
   - Se o HTML não tiver `<head>`, ou já estiver no lugar certo, devolve igual (idempotente).
2. `src/server.ts`: no ramo `publicRequest`, só quando `requestSiteBrand(request) === "cordial"`, a mesma regra de host de `shouldInstallCordialGtm` (apex, www, override; prévia e Gestão ficam de fora), `content-type` começa com `text/html` e o status é 200/404/410:
   - Lê `await normalized.text()` (bufferiza; as páginas já são `no-store`), aplica o helper e devolve `new Response(html, …)` com os mesmos headers e status. Remove o `content-length`, se existir.
   - Morar, Gestão, imagens, JSON, `/api/*` e redirects passam como hoje, com streaming intacto.
   - Chamamos o helper só para mover, sem `id`: o ID continua vindo só do `cordialGtmDecision`/settings via `RootShell`. Se a tag não estiver no documento, nada é inserido, e isso evita uma segunda fonte de ID no servidor. A inserção com ID existe no helper e é testada, mas não fica ligada no `server.ts`. Se você quiser ligar, o ID pode ir por um header privado no mesmo padrão de `X-Cordial-Page-Status`, removido antes da resposta. Isso só seria feito com o seu aval.
3. `package.json`: incluir `src/lib/cordial-site/gtm-head-placement.test.ts` no script `test`.

Sem migration, sem settings, sem ID fixo, sem tocar em Consent Mode, `loadGtm`, eventos ou Morar.

## Hidratação e streaming
- Bufferizar só o HTML da Cordial evita cortar o `<script>` entre pedaços e dispensa o TransformStream. O custo é o TTFB esperar o documento inteiro, que já é pequeno e não cacheado.
- Na hidratação, o React 19 não recria o `<script>` inline. Ele reaproveita ou ignora o nó (`suppressHydrationWarning` já existe), e o script já executou na posição do SSR. Se o React reposicionar o nó no navegador, isso não executa de novo (scripts inseridos pelo React não rodam) e o `loadGtm` idempotente segue protegendo contra uma segunda carga. O aceite vale para o código-fonte servido.
- Risco: um erro no helper derrubaria a página. Mitigação: `try/catch` que devolve o HTML original sem alterar.

## Riscos
- Uma regex frágil em atributos: o helper procura só o marcador exato `data-gtm="cordial"` e o fechamento `</script>` correspondente. O snippet não contém `</script>`.
- Prévia/Lovable: não é host da Cordial, então nada muda.
- Página de erro 500 (`renderErrorPage`): não tem GTM, então nada é inserido.

## Testes (`gtm-head-placement.test.ts`)
- HTML no formato da produção (charset, viewport, preloads, CSS, title, OG, modulepreload, canonical, GTM no fim, JSON-LD, noscript no início do body): o GTM fica imediatamente após o charset e antes de qualquer link/title/meta. Há exatamente 1 script e 1 noscript `data-gtm`, o noscript continua o primeiro filho do body, `consent','default'` com *denied* vem antes de `gtm.start` e não aparece `gtag/js`.
- HTML da Morar/Gestão sem GTM e sem ID: sai idêntico.
- Sem script, com ID válido: insere 1 script e 1 noscript no lugar certo. Com ID inválido: não insere.
- Já posicionado: a saída é igual à entrada, e duas passadas dão o mesmo resultado.
- Duas cópias de entrada: sobra uma.
- `gtm-install.test.ts` segue verde; typecheck e lint ok.
- Depois da implementação: verificar o HTML do SSR local com o host da Cordial simulado. Produção só depois da sua autorização para publicar.
