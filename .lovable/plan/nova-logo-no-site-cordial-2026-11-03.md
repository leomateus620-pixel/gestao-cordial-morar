# Nova logo no site Cordial

## O que muda
- O topo do site Cordial passa a mostrar a logo enviada (casa turquesa + "Cordial IMÓVEIS" em petróleo), no lugar da atual.
- Tamanho ajustado: cerca de 40px de altura no computador e 32px no celular, alinhada verticalmente ao menu, sem distorção.
- O rodapé do site Cordial usa a mesma logo, em versão clara legível sobre o fundo escuro (se o rodapé for escuro); caso contrário, a mesma logo.
- Site Morar não é alterado.

## Qualidade
- A imagem enviada tem margens brancas grandes; será recortada para tirar as sobras e o fundo branco removido (transparente), para não aparecer um retângulo branco.
- Mantida em alta definição (resolução dupla para telas de celular/Retina).

## Conferência
- Verificar em celular, tablet e computador que a logo fica nítida, centralizada no topo e sem empurrar o menu.
- Não publicar sem sua autorização.

## Detalhes técnicos
- Recorte/transparência com ImageMagick; envio como asset CDN; troca em `SiteShell.tsx` (cabeçalho e rodapé, só marca cordial) e ajuste de altura em `site.css` (`.cs-brand img`).
