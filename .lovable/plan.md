# GTM-N2GRRGRW só no site público da Cordial

## Resultado esperado
- Em cordialimoveis.com (e www, que já redireciona), todas as páginas trazem a tag oficial do Google Tag Manager logo no início do `<head>` e o `<noscript>` logo após o `<body>`, uma única vez.
- Morar, Gestão (cordialgestao.com) e prévias (lovable.app, id-preview, localhost) não recebem nada.
- Nenhuma segunda tag do Google (nem `gtag/js?id=G-…`, nem outro `gtm.js`) enquanto o GTM estiver ativo.
- O ID fica visível em Site e Google → Verificação e medição da Cordial.

## Arquivos
| Arquivo | Mudança |
|---|---|
| `src/lib/cordial-site/gtm-install.ts` (novo, puro) | `shouldInstallCordialGtm({ host, pathname, containerId, cordialHostOverride? })` e `gtmHeadScript(id)` / `gtmNoscriptSrc(id)` |
| `src/lib/cordial-site/gtm-install.test.ts` (novo) | testes do helper e do render |
| `src/routes/site.tsx` (layout `/site`, loader) | loader devolve `gtm: { id } \| null`, decidido no servidor pelo host real |
| `src/routes/__root.tsx` (`RootShell`) | lê a decisão do match `/site` e injeta script no início do `<head>` e noscript no início do `<body>` |
| `src/lib/cordial-site/meta-pixel.ts` (`loadGtm`) | idempotente: não faz nada se já houver `script[data-gtm]` ou `gtm.js?id=` no documento |
| `src/components/cordial-site/SiteAnalytics.tsx` | com GTM ativo: só consent update; não chama `loadGtm`, não injeta `gtag/js` |
| `src/components/.../SiteGoogleSettings.tsx` | texto do aviso mais explícito (GA4 direto é ignorado com GTM ativo) |
| `package.json` | incluir o teste novo no script `test` |
| `AGENTS.md` | uma regra: tag do Google do site público é decidida no servidor por host/rota, uma por página |

## Helper de host
- Instala só se: `isGtmId(containerId)` **e** host (minúsculo, sem porta) ∈ { `SITE_PUBLIC_HOSTS.cordial`, `www.` + ele, `VITE_CORDIAL_SITE_PUBLIC_HOST` se definido } **e** marca da rota não é Morar.
- Recusa explicitamente: host Morar, `GESTAO_HOSTS`, qualquer `*.lovable.app`, `localhost`, IPs, e `/site-morar`. Nas rotas `/site` acessadas pelo Gestão já existe 301 para o domínio da marca, então lá nunca chega a renderizar.
- O host vem do servidor (request do SSR via `getRequest()` dentro de server function chamada pelo loader do `/site`), nunca de `window.location`. Na navegação no navegador o loader reaproveita a decisão; o shell não muda, logo nada é reinserido.

## Injeção uma vez só no documento
- `RootShell` usa `useRouterState` para achar o match `/site` e seu `loaderData.gtm`.
- `<head>`: primeiro filho, antes de `<HeadContent />`, um `<script data-gtm="cordial" dangerouslySetInnerHTML>` com, em ordem:
  1. `window.dataLayer=window.dataLayer||[]; function gtag(){dataLayer.push(arguments);}`
  2. `gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})`
  3. snippet oficial do GTM (`gtm.start`, `event:'gtm.js'`, `gtm.js?id=GTM-N2GRRGRW`).
- `<body>`: primeiro filho, `<noscript data-gtm="cordial"><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N2GRRGRW" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`.
- O ID é validado por `isGtmId` antes de entrar no texto (sem risco de injeção). `suppressHydrationWarning` nos dois elementos, pois o GTM altera o DOM antes da hidratação.
- O trecho colado pelo Leonardo não é usado como está.

## Consentimento e SiteAnalytics
- Padrão *denied* já sai no HTML; `analytics-consent.ts` passa a reutilizar o `gtag` existente (já faz `??=`), sem novo default.
- Aceitar: `gtag('consent','update',{analytics_storage:'granted'})`; publicidade continua denied. Recusar/retirar: update para denied.
- Banner "Preferências de métricas" continua (Cordial já tem política de privacidade).
- Com GTM ativo: efeito do GA4 direto não roda mesmo se `analyticsMeasurementId` for preenchido; `loadGtm` não é chamado. Pixel continua como está (campo vazio).
- Eventos próprios `cordial:analytics` (property_open, search_applied…): após consentimento, encaminhados uma vez ao `dataLayer` como `{ event: 'cordial_<nome>', ...campos permitidos }` usando a mesma lista branca atual (sem dados pessoais). Nunca `page_view`.

## Páginas seguintes (SPA)
- O site não envia `page_view` em troca de rota.
- No container GTM (configuração do Leonardo, fora do código): tag GA4 com acionador **History Change** ou medição aprimorada "alterações de histórico". Fazer as duas coisas no site e no container contaria em dobro.

## Gravação do ID (não executar agora)
Um único campo, só na Cordial, preservando o resto do JSON:
```sql
UPDATE public.cordial_site_settings
SET content = jsonb_set(content, '{gtmContainerId}', '"GTM-N2GRRGRW"', true)
WHERE <linha única de settings da Cordial>;
```
Alternativa equivalente: salvar pela tela Site e Google (mesma função atual). Sem migração, sem tocar `morar_site_settings`. Sem ID fixo no código como reserva: vazio = nenhuma tag (evita vazar o container se o campo for limpo).

## Testes
- Helper instala: `cordialimoveis.com` e `www.cordialimoveis.com` em `/`, `/buscar`, `/imovel/x`, `/site/x`.
- Não instala: Morar, `cordialgestao.com`, `www.cordialgestao.com`, `*.lovable.app`, `localhost`, ID vazio ou inválido.
- Render do shell: exatamente um `gtm.js?id=GTM-N2GRRGRW` e um `ns.html?id=GTM-N2GRRGRW`; script antes da primeira meta no `<head>`; noscript primeiro filho do `<body>`.
- `loadGtm` com tag já presente não adiciona script; com GTM ativo e `analyticsMeasurementId` preenchido não surge `gtag/js`.
- `isGtmId("GTM-N2GRRGRW")` verdadeiro; testes de consentimento, contrato e seo-phase1 seguem verdes; typecheck e lint.
- Conferência no navegador da prévia: nenhuma tag (comportamento correto fora do domínio oficial).

## Riscos
- **Prévia:** sem tag por desenho; a verificação real só ocorre após publicar e gravar o ID (Tag Assistant no domínio).
- **Hidratação:** script/noscript mudam o DOM; tratado com `suppressHydrationWarning` e conteúdo idêntico no servidor e no navegador.
- **Tag duplicada:** removida pelo bloqueio no `SiteAnalytics`, `loadGtm` idempotente e o shell que não re-renderiza na navegação.
- **Contagem dupla:** evitada por não haver `page_view` no site; depende de o container usar History Change.
- **Cache:** respostas do site já são `no-store`.

## Fora de escopo
Publicar, RLS, sync, Morar, Gestão, Pixel, Search Console e outros campos de settings.
