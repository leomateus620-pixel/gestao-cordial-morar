# Fotos mais rápidas no site Cordial (destaques e ficha do imóvel)

## O que foi medido
- Cada foto de card (cerca de 160 KB) leva de 1 a 3,9 segundos para chegar, tanto na prévia quanto no site publicado.
- O navegador guarda a foto por apenas 30 segundos. Depois disso pede tudo de novo ao servidor, então voltar à home ou abrir outro imóvel repete a espera.
- Para cada foto, o servidor faz duas consultas de autorização, uma leitura no armazenamento e uma conferência do arquivo inteiro antes de responder. Por isso nenhuma foto chega rápido, nem as que já estão prontas.
- As fotos vêm só em JPEG e não há versões menores para telas pequenas.

## O que será feito
1. **Guardar as fotos por mais tempo.** O endereço de cada foto já muda quando a foto muda. Assim, o navegador e a rede de entrega podem guardar cada versão por dias. Retirar uma foto continua funcionando: ela some da página e o endereço antigo deixa de ser autorizado.
2. **Servidor mais leve por foto.** Uma só consulta de autorização. A conferência completa do arquivo acontece só quando ele é gerado. As fotos prontas passam a ser entregues direto.
3. **Pré-carregamento inteligente.**
   - Home: a foto principal e os 5 destaques carregam primeiro, com prioridade alta. Os 15 imóveis seguintes carregam conforme a pessoa rola a página.
   - Ao passar o mouse ou o dedo num card, as primeiras fotos daquele imóvel já começam a ser buscadas.
   - Na ficha: a foto principal e as 2 seguintes carregam de imediato. As demais vêm em segundo plano, e a próxima foto da galeria sempre fica pronta antes do clique.
4. **Tamanho certo para cada tela.** Celular recebe a versão menor, computador a maior. A ampliação em tela cheia só busca a foto grande quando é aberta.
5. **Sem tela piscando.** Cada foto ocupa seu espaço desde o início, com fundo suave até aparecer.
6. **Gerar antes da visita.** A rotina que já prepara as fotos passa a preparar também as versões dos cards e da ficha dos imóveis publicados. Assim, o visitante não espera a foto ser criada.

## Garantias
- Fotos, galerias, ordem, Drive, ImobiBrasil e o site Morar não são alterados.
- Os dados das fotos continuam sem localização (EXIF/GPS).
- Nada vai ao ar sem a sua autorização.

## Como vou conferir
- Medir de novo o tempo de cada foto: a meta é menos de 300 ms nas repetidas e menos de 1 s na primeira.
- Abrir home e ficha no computador e no celular e comparar o tempo até os destaques aparecerem, antes e depois.
- Retirar a autorização de uma foto de teste e confirmar que ela deixa de aparecer.

## Detalhes técnicos
- `http.server.ts` `mediaResponse`: `Cache-Control: public, max-age=604800, immutable` + `CDN-Cache-Control`, já que a URL é versionada (`id/version/size`). 404 sem cache. Remover a segunda consulta `_authorized_media`, ou trocá-la por uma checagem só quando o derivado for gerado agora.
- `media-derivatives.server.ts`: o checksum completo roda só na geração e na limpeza; a leitura confia no metadado salvo. Manter o cache em memória por instância.
- `PropertyCard`/`HomePage`: `fetchPriority="high"` + `eager` só nos 5 destaques; `srcSet` thumb/card/full com `sizes`; `<link rel="preload">` da imagem principal no `head()` da home e da ficha.
- `DetailPage`/galeria/QuickView: pré-carregar as imagens vizinhas com `new Image()`; a versão `full` só no lightbox.
- Worker `site-media-worker`: incluir pré-geração das versões `card`/`full` dos imóveis publicados, em lotes limitados.
