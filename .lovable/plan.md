# Publicação das Fases 1, 2 e 3 (Cordial e Morar)

## O que será feito
1. Conferir os alertas de segurança antes de publicar. Se houver alertas críticos, eles serão informados, mas não impedirão a publicação, salvo se o sistema bloquear.
2. Aplicar a migração aditiva que redireciona as URLs antigas do ImobiBrasil (`/imovel/<código antigo>`) para o novo anúncio. Ela apenas cria funções de leitura e não altera imóveis, fotos ou publicações.
3. Publicar o projeto. Isso coloca no ar tudo o que está na prévia: SEO, endereços amigáveis, banners, busca, destaques, redirecionamentos, privacidade, consentimento e a central "Site e Google".
4. Depois da publicação, conferir nos dois domínios: página inicial, página de um imóvel com endereço amigável, sitemap, robots e um endereço antigo redirecionado.

## O que não muda
- O envio direto de imóveis do Gestão para os sites, as fotos e as marcas d'água.
- O ImobiBrasil continua desligado.
- Nenhum dado é alterado em massa.

## Atenção
- A publicação leva todas as mudanças que estão na prévia.
- As configurações reais (Analytics, Pixel, Tag Manager e verificação do Google/Bing) precisam ser preenchidas depois, no painel.

## Detalhes técnicos
- A migração `drizzle/pending/site_legacy_redirects.sql` será aplicada pela ferramenta de migração e entrará no journal.
- A publicação será feita com `preview_ui--publish` e verificada com curl nos domínios cordialimoveis.com e imobiliariamorarimoveis.com.br.
