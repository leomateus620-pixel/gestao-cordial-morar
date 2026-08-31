# Correção: imóvel publicado chega vazio nos sites

## O que foi verificado no banco (fatos)

- O imóvel Ref. 3336 / Cordial 1340 existe no Gestão Cordial **com todos os dados**: tipo Casa, valor R$ 205.000, descrição completa, bairro e cidade.
- **Nenhum registro de publicação** (`property_provider_publications`) e **nenhum job de sincronização** (`property_sync_jobs`) foi criado para esse imóvel — 0 tentativas registradas. Ou seja: o sistema **nunca chegou a enviar** os dados para Morar/Cordial.
- As 3 fotos do imóvel estão com status `failed_permanent`, erro `WebAssembly.Module(): Wasm code generation disallowed by embedder` (fila antiga de marca-d'água no servidor, hoje substituída pela marca-d'água no navegador).

## Causa raiz

Na função de publicação, antes de criar a publicação e o job de envio, existe um bloqueio que rejeita a operação quando há qualquer foto em status de falha (`failed_permanent`, `failed`, `failed_retryable`), e não apenas fotos ainda em processamento. Com as 3 fotos travadas da fila antiga, a publicação abortou com aviso e o imóvel nunca entrou na fila de envio.

O que aparece no site com Ref 3336 é, portanto, um registro sem os dados do Gestão Cordial — nada de título, valor ou descrição foi transmitido porque nenhuma requisição chegou a ser feita.

## Correção proposta

1. **Desbloquear a publicação** (`src/lib/imoveis/publish.functions.ts`)
   - Só segura o envio quando há foto realmente em andamento (`pending` / `processing`).
   - Fotos com falha deixam de bloquear: elas simplesmente não são enviadas (o worker já só publica imagem com arquivo processado) e o usuário recebe um aviso claro de quantas fotos ficaram de fora.

2. **Tornar o enfileiramento à prova de falha**
   - Criar primeiro a publicação e o job de sincronização; só depois disparar o processamento de imagens, dentro de `try/catch`.
   - Assim, um erro na fila de fotos nunca mais impede o envio dos dados do imóvel.

3. **Aviso honesto na tela de cadastro**
   - Ao concluir, informar “Imóvel enviado para publicação — X foto(s) não subiram, reenvie na Etapa 6” em vez de falhar em silêncio.

4. **Reenviar o imóvel afetado**
   - Após a correção, enfileirar a publicação do imóvel 3336/1340 nos dois destinos e acompanhar o resultado (`property_sync_attempts`), confirmando que valor, descrição, área e características chegam à API.
   - As 3 fotos travadas serão marcadas para reenvio (a marca-d'água agora roda no navegador e sobe pronta).

## Detalhes técnicos

- Arquivo principal: `src/lib/imoveis/publish.functions.ts` (função `enqueuePropertySync`).
- Ajuste de mensagem em `src/routes/_app.imoveis.novo.tsx`.
- Sem mudança de schema. Sem alteração no serializador — a verificação mostrou o mapeamento correto de `descricaoImovel`, `valorImovel`, áreas e booleanos `sim`/`nao`.
- Validação: enfileirar o envio real e ler `property_sync_attempts` / `property_provider_publications` para confirmar status `published` e a URL pública retornada.
