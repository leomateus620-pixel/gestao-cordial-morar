# "Ver anúncio no site" para imóveis da outra imobiliária

## Como fica
- Se o imóvel está no site da marca da seleção, o botão abre o anúncio nesse site, como já acontece hoje.
- Se ele só está no site da outra marca (por exemplo, um imóvel Morar dentro de uma seleção Cordial), o botão aparece e abre o anúncio no site da outra marca.
- Se o imóvel não está em nenhum dos dois sites, o botão não aparece.
- Os links, os imóveis e a ordem de cada seleção não mudam.

## Como vou conferir
- Vou abrir sem login a seleção da Maria Eduarda (Cordial, com os imóveis 2758, 3269 e 3301 da Morar) e a do Alisson. Em cada imóvel, vou confirmar para qual site o botão leva.
- O teste fica só na prévia. Publico só quando você autorizar.

## Detalhes técnicos
- Uma migração aditiva recria `shared_selection_public` e acrescenta `site_brand` em cada item. O código procura primeiro na view da marca da seleção e, se não achar, na view da outra marca.
- `public-view.ts` passa a ler `siteBrand`, e `s.$token.tsx` monta a URL com `selectionPropertyUrl(sitePublicId, siteBrand ?? agency)`.
- Um teste novo garante que um imóvel da Morar numa seleção Cordial gera o link no domínio da Morar.
