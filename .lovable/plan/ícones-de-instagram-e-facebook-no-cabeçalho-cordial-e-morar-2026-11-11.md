# Ícones de Instagram e Facebook no cabeçalho (Cordial e Morar)

## O que muda para o visitante
- No topo dos dois sites, ao lado dos favoritos, vão aparecer os ícones do Instagram e do Facebook da própria marca:
  - Cordial: @cordialimoveis.
  - Morar: @morarimoveis.sr.
- Cada ícone abre o perfil em uma nova aba e tem nome para leitores de tela, como "Instagram da Cordial Imóveis".
- Os ícones seguem o mesmo tamanho, a mesma cor e o mesmo efeito ao passar o mouse dos botões que já existem no topo.
- No celular, os ícones continuam visíveis no topo se couberem sem apertar a logo. Em telas muito estreitas, eles saem do topo e aparecem no menu lateral (☰), para não atrapalhar.
- O rodapé ganha também o ícone do Facebook, igual ao do Instagram.
- Um ícone só aparece quando o link está preenchido no painel. Se o campo ficar vazio, o ícone some.

## O que não muda
Logo, menu, busca, imóveis, fotos, SEO, redirecionamentos e outras integrações.

## Publicação
O ajuste fica pronto na prévia. Para chegar aos sites no ar, é preciso uma nova publicação, que só será feita com a sua autorização.

## Detalhes técnicos
- `SocialIcons.tsx`: novo `FacebookIcon`, com o mesmo traço do `InstagramIcon`.
- `SiteShell.tsx`, em `.cs-header-actions`: links `cs-icon-button cs-header-social` antes de favoritos, a partir de `settings.instagram` e `settings.facebook`, com `target="_blank"` e `rel="noopener noreferrer"`. Os mesmos links entram no menu móvel e o ícone do Facebook entra no rodapé.
- `site.css`: regra escopada para `.cs-header-social`, ocultando no topo abaixo de cerca de 380px. Os blocos responsivos já existentes por marca não mudam.
- Verificação com Playwright na prévia das duas marcas em 1366, 768, 390 e 360px: links, nova aba e ausência de sobreposição com a logo.
