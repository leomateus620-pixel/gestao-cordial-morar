# Fotos ponta a ponta: incluir, excluir, substituir e reordenar nos dois sites

## O que confirmei agora (somente leitura)

- A exclusão de foto EXISTE na documentação viva dos dois sites: `POST /imovel/{codigoImovel}/imagem/excluir/{codigoImagem}` (token, código do imóvel e código da imagem nos cabeçalhos; resposta `status: true`). A premissa antiga de "não há exclusão" está errada.
- A listagem devolve `codigoImagem`, `url` e `destaque`, com paginação (`page`, `per_page`, `status`). Hoje o sistema lê só a primeira página: galeria grande fica cortada e a conferência por contagem sai errada.
- A resposta da inserção não é descrita no contrato. Hoje o código tenta adivinhar o código da foto com o leitor genérico de imóvel, que pode devolver o código do IMÓVEL no lugar do código da imagem. Todos os registros de código de foto estão vazios.
- Excluir uma foto no Gestão apaga o registro e os arquivos na hora; o vínculo com o site vai embora junto e a foto fica órfã no anúncio para sempre.
- O encerramento do trabalho de fotos agenda o acompanhamento enquanto o próprio trabalho ainda está "processando": o pedido só fica marcado como pendente e nenhuma rotina o executa depois. Mudança feita durante o envio não chega ao site.

## O que vou entregar

### 1. Um vínculo confiável por foto e por site
Cada foto passa a ter, para a Cordial e para a Morar separadamente: foto local, versão/hash do arquivo entregue, código da foto no site, endereço da foto no site, estado e data da última conferência. Leitor próprio de imagem (nunca o de imóvel), que valida o formato real da resposta e percorre todas as páginas da galeria.

### 2. Exclusão de verdade, com segurança
- Excluir no Gestão passa a registrar primeiro a intenção de exclusão (com o código da foto no site de cada destino) e só depois apagar metadados e arquivos.
- O vínculo é preservado até a remoção ser confirmada em cada site, uma foto por vez, conferindo a galeria depois de cada remoção.
- Se a Cordial confirmar e a Morar falhar, apenas a entrega da Morar fica pendente e volta sozinha.

### 3. Substituição retomável
Trocar uma foto vira uma operação persistente em passos (nova foto entra, antiga sai), com o original sempre preservado e cada passo registrado. Nunca recria o anúncio, nunca duplica por nova tentativa e nunca limpa a galeria inteira para corrigir uma imagem.

### 4. Envio sem resposta = inconclusivo
Contagem a mais não prova que o arquivo certo chegou, e contagem igual logo depois de um tempo esgotado não prova que falhou. A conferência passa a ser por código e identidade da foto (endereço/arquivo), percorrendo a paginação e tolerando alterações feitas ao mesmo tempo. Sem certeza, o estado fica "entrega desconhecida" e nada é reenviado às cegas.

### 5. Ordem e capa automáticas (sua escolha)
Quando a ordem ou a capa mudar no Gestão, o sistema reconstrói a sequência no site pelo caminho suportado (apagar e reinserir na ordem correta), sempre a partir dos arquivos guardados, em passos com checkpoint e retomada. Enquanto a reconstrução acontece o anúncio fica alguns instantes com menos fotos — a tela avisa isso. Uma única capa é garantida; mais de um destaque é detectado e corrigido pelo mesmo caminho, e repetição visual da mesma foto no anúncio nunca é confundida com anúncio duplicado.

### 6. Fila de fotos correta
Encerrar o trabalho atual e agendar a revisão seguinte passam a ser uma única operação, com o trabalho já encerrado — mudança feita durante o envio gera processamento efetivo. A varredura de recuperação compara a versão desejada com a confirmada (inclusive a que hoje fica só marcada) e usa checkpoint, orçamento de execução e renovação de reserva para não perder progresso em galeria grande.

### 7. "Sincronizado" só quando é verdade
O estado só fica sincronizado sem falta, sem sobra, sem conteúdo divergente, sem entrega desconhecida e sem capa/ordem pendente. Contagem sozinha deixa de bastar.

### 8. Validação do arquivo
Formato, tamanho, tipo e conteúdo binário conferidos antes do envio, conforme a API. Originais preservados e marca d'água correta para cada destino, sem aplicar a marca duas vezes.

### 9. Estados claros na tela
Por site: salvo no Gestão, aguardando marca d'água, aguardando envio, exclusão pendente, substituição em andamento, reconstruindo ordem, entrega desconhecida, confirmado no site. Limitação restante aparece com nome próprio, sem anunciar sincronização completa.

## Detalhes técnicos

- Novo `src/lib/imobibrasil/image-parsers.ts` (puro): `parseRemoteImageList` → `{recognized, items: {codigoImagem, url, destaque}[], pagination}`; `extractInsertedImageId` só aceita chave de imagem (nunca `codigoImovel`), devolvendo `null` quando a resposta não identifica a foto. `fetchPropertyImages` passa a percorrer páginas até esgotar; formato desconhecido/paginação incompleta = inconclusivo, nunca "galeria vazia".
- Novo `src/lib/imobibrasil/image-ops.server.ts`: `deleteRemoteImage` (POST oficial, headers `token`/`codigoImovel`/`codigoImagem`, uma por vez, com leitura de conferência) e `reconcileRemoteGallery` (casa foto local ↔ `codigoImagem` por código, e por hash/arquivo quando o código está ausente).
- Migração aditiva em `property_image_provider_publications`: `desired_state` (present/absent), `remote_url`, `pending_delete_at`, `deleted_at`, `replacement_of_image_id`, `verified_at`, `verification` jsonb, `last_op`/`last_op_state`. Em `property_provider_publications`: `media_rebuild_state` jsonb (checkpoint da reconstrução de ordem). `property_images` ganha `pending_remote_delete` para não apagar o registro antes da confirmação; `property_sync_jobs` recebe ações `media_delete` e `media_rebuild` (pausa cadastral continua sem afetar mídia).
- `property_media_finish` reescrito para encerrar o job e agendar o seguinte na mesma transação (recebe o id do job, marca `succeeded` e chama o coalescer sem ver o próprio job como "processando"). `queue_media_sync_coalesced` deixa de perder o pedido quando o único job ativo é o que está terminando.
- `media-sync.server.ts`: plano de galeria passa a produzir inserções, exclusões e reconstrução; `deliverGallery` grava `codigoImagem` real, confere por código/identidade e respeita orçamento de tempo com renovação de reserva; `image-retry.server.ts` passa a incluir publicações com `media_dirty_revision` e com versão confirmada menor que a desejada.
- `media.functions.ts`: `deletePropertyImage` registra exclusão pendente antes de apagar; novo `replacePropertyImage`; `reorderPropertyImages`/`setPropertyImageCover` enfileiram reconstrução.
- Testes (`bunx tsx --test`): inclusão após publicação; exclusão de foto comum e de capa; substituição; tempo esgotado; envio concorrente; edição da galeria durante o processamento; falha em um site e sucesso no outro; resposta de lista desconhecida; paginação; retomada por checkpoint. Cordial e Morar testadas separadamente.
- Limpeza das fotos antigas sobrando fica FORA desta etapa, conforme sua escolha.
