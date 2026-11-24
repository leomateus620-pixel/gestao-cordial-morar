# Fotos sumidas no Gestão + regra de caminho nas listas dos sites

## O que já foi confirmado (só leitura, nesta conversa)
- A ficha monta a galeria em `_app.imoveis.$imovelId.index.tsx` (linha ~142) a partir de `media.gallery.data`, que depende da fila de ordem.
- `media.functions.ts` (`signImages`, linha ~90) gera miniatura por transformação (480x480) e, se não houver, cai para a URL inteira (linha ~106).
- Última migração existente: **0112**. A próxima será **0113**.
- A regra `(^https?:|\.\.)` existe em `0002_morar_owned_site.sql` e em outras (vídeo, 0025). As views atuais serão lidas por inteiro antes de recriar.
- Imóvel Morar 3454: lote 1 (18:52 UTC) com 1 foto, **completo**. Lote 2 (19:01:55 UTC): 15 esperadas, 15 falhas, marcado `incomplete` 7 s depois, sem reserva. A tabela não guarda o texto do erro, então a causa **ainda não está confirmada**.

## 1. Ficha e etapa Fotos: nunca esconder foto ativa
- Nova função pura `resolveGalleryPhotos(activeImages, queueKeys, mediaPhotos)` em `src/lib/imoveis/gallery-fallback.ts`, que devolve `{ photos, mode: "queue" | "safe" }`:
  - **Fila completa (`queue`):** a lista de chaves já carregada na tela (`orderView.keys` em `usePropertyMedia`) cobre todas as fotos ativas de `property_images`, sem contar as `pending_remote_delete`.
    - A chave de cada foto segue a regra atual `uploadKey ?? id`: as fotos antigas usam o próprio `id`.
    - Não depende da chave nova `galeria-<uuid>` nem de `property_gallery_upload_order`, que hoje está vazia em todos os imóveis.
    - Assim, os ~738 imóveis só com fotos antigas ficam em `queue`, com todos os controles liberados, e o comportamento do PR #50 é mantido.
  - **Modo de segurança (`safe`):** só quando falta de fato alguma foto ativa na lista carregada, ou a lista não carregou. Vale a ordem inteira do banco (`property_images.position`, capa na posição 0). Nada é misturado com a fila.
  - Regra fixa: o número de fotos exibidas é sempre igual ao de fotos ativas.
- No modo `safe`, ficam desativados "Organizar fotos", arrastar e "Definir capa", na ficha e na etapa Fotos. Aparece um aviso curto: "Ordem das fotos em modo de segurança; organização temporariamente indisponível." Nada é gravado nesse modo.
- Arquivos alterados:
  - `src/routes/_app.imoveis.$imovelId.index.tsx`: usa a função e desativa os controles conforme o modo.
  - `src/hooks/usePropertyMedia.ts`: expõe `photos` e `mode`.
  - `src/components/imoveis/PropertyPhotosStep.tsx` e `PropertyGallery.tsx`: mesma lista, controles desativados no modo `safe`.
- Miniatura: em `media.functions.ts` (`signImages`), foto sem `thumbnail_storage_path` (legacy) recebe `thumbUrl = url` (foto inteira), sem transformação. Isso evita depender de um serviço de imagem que pode estar indisponível. O custo é mais tráfego nas fotos antigas.
- Rede de segurança: `PropertyGallery.tsx` e `PropertyPhotosStep.tsx` ganham um `onError` que troca, uma única vez, a miniatura pela foto inteira.

## 2. Migração 0113 (só as duas views; não roda antes do seu OK)
- Arquivo `0113_authorized_media_path_rule.sql`: só `CREATE OR REPLACE VIEW` de `cordial_site_authorized_media` e `morar_site_authorized_media`.
  - A definição atual é copiada como está; só a expressão do caminho é trocada por `storage_path ~* '^https?:' OR storage_path ~ '(^|/)\.\.(/|$)'`.
  - Mesmas colunas, mesma ordem e mesmas permissões. Não toca em dados, assinaturas aprovadas, gatilhos nem na regra dos vídeos (0025).
- Antes do seu OK, só uma consulta de leitura nos `storage_path` atuais, comparando a regra antiga e a nova, que vai mostrar:
  - quantas fotos e quantos imóveis mudam de resultado;
  - que o único imóvel liberado é o 1444/3441;
  - que nenhum caminho com `..` como pasta ou com URL passa pela regra nova.
- Sem DDL nem transação de teste no banco de produção.

## 2b. Preparo das fotos para os sites (só leitura antes de qualquer mudança)
- Conferir se outra trava, além das views, bloqueia o nome `.../originais/<uuid>-full...jpg` do 1444/3441:
  - `src/lib/cordial-site/media-derivatives.server.ts` e o worker de mídia, com o bucket `public-site-derivatives`;
  - as rotas `/api/cordial-site/media/...` e `/api/morar-site/media/...`;
  - as funções SQL de derivados (0024 e as seguintes).
- Na primeira busca, o preparo dos derivados (`media-derivatives.server.ts`) não tem checagem de `..`. Ainda falta ler as rotas de mídia e as funções SQL.
- Se houver outra trava, a correção usa a mesma regra (bloquear `..` só como pasta, e URLs), tem teste próprio e fica listada aqui antes da execução. Ela vale para fotos, não para a regra dos vídeos.
- Validação, depois do OK e da 0113: uma foto do 1444 abre pelo endereço de mídia da Cordial e da Morar (só leitura).

## 3. Investigação do 3454 (antes de qualquer correção)
- Ler os registros do servidor perto de 19:01:55 UTC para `openPropertyImageBatch`, `createPropertyImageUploadUrl` e `reportPropertyImageBatchFailure`.
- Ler os registros do storage (envio para `originais/galeria-…`, RLS) e o código de `prepareImageForUpload`.
- Comparar o caminho de envio entre os PRs #50 e #51 (git diff).
- Tudo só de leitura. O resultado vem para você como relatório:
  - **Bug:** trago a causa e a correção como um plano separado. Nada é aplicado sem um novo OK seu.
  - **Arquivo ou conexão do usuário:** só aviso, sem mudar código nem a mensagem na tela.
- Sinal já visto: o primeiro envio do mesmo imóvel funcionou 10 minutos antes, o que enfraquece a hipótese de permissão.

## Testes (vitest)
- `gallery-fallback.test.ts`:
  - Fila vazia: mostra todas, em ordem `position`, com a capa correta.
  - Fila incompleta: modo `safe`, ordem inteira do banco, nenhuma foto some.
  - Fila completa: modo `queue`, mantém a ordem e a capa novas.
  - Modo `safe`: "Organizar fotos", arrastar e "Definir capa" ficam desativados (teste do componente).
- Teste da miniatura: foto legacy usa a URL inteira; foto com miniatura gravada usa a miniatura.
- `path-rule.test.ts`: espelha a expressão da migração.
  - Bloqueia: `../x`, `a/../b`, `a/..`, `..`, `https://x`, `HTTP://x`.
  - Permite: `.../originais/<uuid>-full...jpg`, `a..b.jpg`.
- Testes atuais de imóveis, cordial-site e site-showcase: rodar e confirmar que nada quebrou.

## Validação no preview (o preview usa o banco real)
- Sem senha ou credencial no chat ou no plano.
- **Imóveis reais, só leitura e visual:**
  - um imóvel Cordial e um Morar só-legacy: fotos e miniaturas aparecem, e o modo de segurança desativa os controles quando a fila está incompleta;
  - o 1444/3441: a galeria aparece normalmente.
- **Gravação (arrastar e definir capa):** só em um imóvel de teste não publicado, sem destino de site e fora de `cordial_site_eligible`/`morar_site_eligible`.
  - Se não houver um imóvel assim, não testo a gravação e aviso você.
  - Se algum imóvel real for tocado por engano, restauro a ordem e a capa originais na hora, sem reenvio aos sites.
- Etapa Fotos do cadastro: só visual, com o mesmo número de fotos que o banco.
- A entrada do 1444/3441 em `*_site_authorized_media` só é conferida depois que você aprovar e a 0113 for aplicada.

## Sem regressão (não será tocado)
- Fila e reserva de envio, marca-d'água, processador e despachante de fotos (incidente do 1385).
- Assinaturas aprovadas, sync Imobi e crons.

## Riscos e como desfazer
- **Ordem da junção:** só muda a tela; desfazer = reverter o commit. Os dados não mudam.
- **Foto inteira como miniatura:** a ficha fica mais pesada nas fotos legacy; desfazer = reverter o commit.
- **Modo de segurança:** imóveis com a fila incompleta perdem a organização até a fila ficar completa (isso pode virar uma etapa futura, com OK separado).
- **0113:** um caminho com `..` no nome passa a ser aceito. Os caminhos de pasta (traversal) continuam bloqueados, e o storage já é privado e assinado. Desfazer = migração 0114 com a expressão antiga.

## Futuro (precisa de OK separado)
- Gerar miniaturas em massa para as ~11.448 fotos legacy.
