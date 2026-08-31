# Etapa 6: marca-d'água aplicada na hora, sem fila travada

## O que está acontecendo (verificado no banco agora)

As três fotos do print estão presas exatamente por um motivo, gravado no próprio job:

```text
WebAssembly.Module(): Wasm code generation disallowed by embedder
```

- `WhatsApp ... 10.54.04.jpeg` → `failed_retryable`, 3 tentativas
- `WhatsApp ... 10.54.00.jpeg` → `failed_retryable`, 3 tentativas
- `WhatsApp ... 10.54.04 (1).jpeg` → `processing`, lease vencendo e voltando para a fila

Ou seja: o servidor onde o worker roda **não permite compilar WebAssembly em tempo de execução**. O processador de imagem atual (Photon/WASM) nunca vai inicializar nesse ambiente — por isso o ciclo eterno "erro → tentar novamente → foto repetida → continua na fila". Não é lentidão nem arquivo inválido.

## Solução: aplicar a marca no navegador, antes do envio

O navegador já redimensiona a foto antes de enviar. A marca passa a ser composta no mesmo passo, com Canvas — recurso nativo, sem WebAssembly, instantâneo e com preview imediato.

### 1. Composição da marca no navegador
- Desenhar a logo Morar + Cordial sobre a foto já redimensionada, usando exatamente a mesma geometria/posição/proporção já definida na configuração da marca (nada muda visualmente).
- Gerar duas saídas: a versão com marca (publicável) e a miniatura.
- Manter o original intacto: continua sendo enviado e guardado separadamente.

### 2. Envio e registro
- Enviar original + versão marcada + miniatura para o armazenamento privado, com o progresso real já existente.
- No registro da foto, o servidor valida a versão marcada (tipo real do arquivo, tamanho > 0, dimensões coerentes com o original) e só então marca a foto como `ready`.
- Sem versão marcada válida, a foto não é aceita como pronta — nunca fica "pendente para sempre".

### 3. Fila deixa de ser o caminho principal
- O enfileiramento passa a ser exceção: só entra na fila a foto que chegou sem versão marcada.
- Enquanto o ambiente não permitir WebAssembly, o worker reporta erro acionável e não fica reciclando tentativas silenciosamente; a interface mostra "reenviar a foto" em vez de "tentar novamente" infinito.

### 4. Interface da Etapa 6
- Mostrar a miniatura já com a marca assim que o envio termina (sem espera por fila).
- Barra de progresso por foto: preparando marca → enviando → pronta.
- Estado de erro por foto com mensagem clara e ação de reenvio, sem loop.
- Bloqueio de publicação continua valendo para qualquer foto não pronta.

### 5. Reparar as fotos presas
- Reprocessar/limpar os três registros travados do imóvel do print para que o aviso "Aguardando a marca-d'água em 11 foto(s)" desapareça e as fotos possam ser reenviadas normalmente.

## Detalhes técnicos

- `src/lib/imoveis/image-client.ts`: nova etapa de composição via Canvas 2D reutilizando `watermark-config.ts` (mesma variante `morar-cordial`, mesma geometria) e gerando `processed` + `thumbnail`.
- Logos: carregar os templates base64 já existentes em `src/lib/imoveis/watermarks/` como `ImageBitmap`, com cache em módulo.
- `src/lib/imoveis/media.functions.ts`: `createPropertyImageUploadUrl` passa a assinar os três caminhos (`originais/`, `marcadas/`, `thumbs/`); `registerPropertyImage` valida e grava `processed_storage_path`, `thumbnail_storage_path`, checksums, `watermark_variant/version` e `processing_status = 'ready'`, enfileirando job só quando faltar a versão marcada.
- `image-pipeline.server.ts` / `watermark.server.ts`: mantidos como retaguarda, com erro de inicialização classificado como permanente e acionável (`wasm_unavailable`) em vez de retry infinito.
- `PropertyPhotosStep.tsx`: estados por foto, preview com marca e reenvio.
- Migração de reparo para os jobs/fotos presos.

## Validação

- Enviar as mesmas fotos do print e confirmar marca visível no card em segundos, `processing_status = 'ready'` e arquivo marcado legível no armazenamento.
- Conferir no banco que nenhum job novo é criado no fluxo normal.
- Reenviar arquivo repetido: deve reutilizar o registro pronto, sem duplicar nem reabrir fila.
- Publicar o imóvel e confirmar que os sites Cordial e Morar recebem a versão marcada.
