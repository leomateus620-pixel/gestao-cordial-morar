# Direcionar sites Cordial e Morar para os novos domínios

## Situação atual (conferida)
- Os 6 endereços estão ligados ao projeto e ativos: cordialimoveis.com, www.cordialimoveis.com, imobiliariamorarimoveis.com.br, www.imobiliariamorarimoveis.com.br, cordialgestao.com e www.cordialgestao.com.
- Hoje todos abrem o Gestão; os sites ficam em cordialgestao.com/site e /site-morar.
- O sistema já tem a regra pronta para "cada domínio abre seu site", só está desligada por configuração.
- A faixa "· Ambiente de homologação" aparece porque os sites estão marcados como não oficiais (também pedem ao Google para não indexar).

## O que será feito
1. **Tirar a faixa de homologação** dos dois sites, marcando cada um como oficial no seu domínio. Com isso o Google passa a poder indexar as páginas, com endereço oficial correto em cada página e mapa do site.
2. **cordialimoveis.com** abre o site da Cordial na raiz (ex.: cordialimoveis.com/imovel/...), sem "/site" no endereço.
3. **imobiliariamorarimoveis.com.br** abre o site da Morar na raiz, sem "/site-morar".
4. **www** de cada domínio leva para a versão sem www.
5. **Links antigos** (cordialgestao.com/site/... e /site-morar/...) passam a levar automaticamente ao endereço novo equivalente, sem quebrar links já divulgados.
6. **cordialgestao.com continua sendo o Gestão** (login e sistema), sem mudança.
7. Links internos, WhatsApp, compartilhamento e fotos dos sites passam a usar o domínio novo de cada marca.

## Conferência depois de publicar
- Abrir os dois domínios no celular e no computador: sem faixa, home, busca, ficha de imóvel e fotos.
- Conferir que um link antigo /site/... e /site-morar/... cai no domínio certo.
- Conferir que Cordial e Morar não se misturam e que o Gestão abre normalmente.

## Precisa da sua autorização
- Isso só passa a valer depois de **publicar**. Peço seu OK para publicar ao final.

## Fora do escopo
Imóveis, fotos, ImobiBrasil, NFS-e, boletos, recibos, Gestão.

## Detalhes técnicos
- Configurar `VITE_CORDIAL_SITE_PUBLIC_HOST=cordialimoveis.com` e `VITE_MORAR_SITE_PUBLIC_HOST=imobiliariamorarimoveis.com.br` (ativam `rewritePublicInput/Output` e `externalSitePath` já existentes).
- Configurar `<PREFIX>_CANONICAL_ORIGIN` (https://cordialimoveis.com / https://imobiliariamorarimoveis.com.br) e `<PREFIX>_ENV=production` por marca → `indexable=true`, remove `.cs-preview`, `X-Robots-Tag` e libera sitemap/robots.
- Em `src/server.ts`: 301 de `www.` para o domínio raiz da marca, e 301 de `cordialgestao.com/site*` e `/site-morar*` para o domínio novo preservando o restante do caminho e a busca; `/api/` intocado.
- Conferir que os ganchos do site (leads, mídia, vitrine) funcionam no host novo e que o cron da vitrine segue no domínio atual.
- Não definir domínio primário no projeto (redirecionaria tudo para um único domínio).
- Testes vitest para os redirecionamentos e a regra por domínio.
