# Links dos anúncios por site e fotos que travam a sincronização

## Diagnóstico (verificado no banco e no código)

**1. Links quase nunca aparecem — não é falta de link, é filtro na tela**
- Toda publicação com identificador do site já tem link salvo (não há nenhum registro com identificador e sem link).
- Situação atual: Cordial 8 publicados, 8 parciais, 481 divergentes; Morar 14 publicados, 2 parciais, 304 divergentes.
- O card da lista e a ficha só mostram o botão de copiar quando a situação é exatamente "publicado". Como quase tudo está "parcial" ou "divergente", o botão some — mesmo com o link existindo e funcionando.

**2. Por que quase tudo fica "parcial/divergente": as fotos**
- 69 fotos estão com falha definitiva, todas com o mesmo erro: o ambiente publicado não permite mais rodar o processador de marca d'água no servidor.
- Consequência em cadeia: o envio marca "16 imagem(ns) não sincronizada(s)", o imóvel nunca chega a "publicado" e o botão de link desaparece.
- O "Tentar novamente" atual reenfileira o mesmo processamento no servidor, que falha de novo — por isso o problema não se resolve sozinho.
- Fotos novas já são marcadas no navegador e funcionam; o acervo travado é do fluxo antigo.
- Registros de envio também mostram falhas pontuais por descrição acima de 1500 caracteres, tempo esgotado e erro 523 do provedor — tratadas com nova tentativa, não são a causa principal.

## Correções

**A. Um link dedicado por site, com cor da marca**
- Novo controle com um botão por site: Cordial em azul, Morar em laranja, cada um com nome e rótulo próprios.
- Passa a aparecer sempre que houver link do site (publicado, parcial ou divergente), deixando de exigir a situação "publicado".
- Clique copia o link daquele site, com confirmação; o tooltip continua permitindo abrir o anúncio.
- Usado no card da lista e no topo da ficha do imóvel.

**B. Refazer a marca d'água pelo navegador (destrava as fotos)**
- "Tentar novamente" deixa de reenfileirar o processamento do servidor, que não é mais possível no ambiente publicado.
- Passa a: baixar o original guardado, aplicar a mesma marca no navegador (mesma geometria e versão do envio atual), enviar a versão marcada e a miniatura e liberar a foto para publicação.
- Mensagem de erro do processamento antigo passa a orientar o reprocessamento, em vez de "falha inesperada".
- Botão de reprocessar disponível também na seção de publicação da ficha, para destravar sem entrar na edição.

**C. Sincronização volta a concluir**
- Com as fotos liberadas, o envio deixa de contar imagens não sincronizadas e o imóvel alcança "publicado".
- Reprocessar em lote os imóveis afetados e disparar a sincronização para que voltem à situação correta.

## Detalhes técnicos
- `src/lib/imoveis/media.functions.ts`: novas funções `preparePropertyImageReprocess` (links assinados do original + destino de envio) e `finalizePropertyImageReprocess` (grava versão marcada, cancela jobs mortos).
- `src/hooks/usePropertyMedia.ts`: `retryWatermark` reescrito para o fluxo de navegador reutilizando `composeWatermarkedUpload`.
- `src/lib/imoveis/image-pipeline.server.ts`: erro de WebAssembly mapeado para código/mensagem própria.
- `src/components/imoveis/CopyPublicLinkButton.tsx`: novo `PublicLinkButtons` por provedor com cores de marca; uso em `PropertyCatalogCard.tsx` e `_app.imoveis.$imovelId.index.tsx`.
- Sem mudanças de schema, RLS ou serializadores da API.

## Validação
- Conferir na prévia autenticada: imóvel divergente com link mostra os dois botões (azul/laranja) e copia o link certo.
- Reprocessar as 69 fotos travadas e confirmar situação "pronta" e zero imagens não sincronizadas.
- Rodar a sincronização de amostras Cordial, Morar e ambas, confirmando "publicado".
