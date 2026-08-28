# Corrigir definitivamente a Etapa 6 e a publicação das fotos

## Diagnóstico confirmado

- O worker publicado de marca-d’água retorna **500 a cada minuto** com `No such module "wasm/photon_rs_bg-....wasm"`: o arquivo WebAssembly usado pelo processador não foi incorporado ao pacote de produção.
- A foto do teste mostrado nos anexos está no banco como `pending`, sem arquivo processado e **sem nenhum job associado**.
- A criação do job usa `upsert` sobre `(image_id, destination_hash)`, mas o banco possui apenas um índice único parcial. Esse formato não atende o conflito informado pelo cliente de dados; por isso a foto pode ser salva e a criação do job falhar logo depois.
- Ao reenviar o mesmo arquivo, o checksum encontra a foto já gravada e responde “Foto repetida”, mas não recria o job ausente. Isso explica exatamente o ciclo “erro → tentar novamente → foto repetida → na fila para sempre”.
- A publicação também verifica apenas os estados antigos `pending` e `failed`; os estados atuais `processing`, `failed_retryable` e `failed_permanent` podem escapar da validação e a foto ser omitida silenciosamente do envio aos sites.

## Implementação

### 1. Tornar o processador compatível com produção
- Trocar o carregamento do Photon por sua distribuição com WASM incorporado ao JavaScript, evitando dependência de um arquivo `.wasm` externo ausente no servidor publicado.
- Liberar explicitamente as imagens/objetos WASM intermediários após cada transformação para reduzir memória em lotes.
- Manter os limites de resolução, tamanho, lote e a marca única Morar + Cordial.

### 2. Garantir que toda foto tenha um job válido
- Substituir o índice parcial por unicidade real de `(image_id, destination_hash)`, compatível com o `upsert` usado pela aplicação.
- Tornar o enfileiramento idempotente: se o job já existe, reativá-lo e limpar lease/erro/tentativas; se não existe, criá-lo.
- Conferir erros de leitura e atualização do banco em cada etapa, sem deixar a foto como `pending` quando o job não foi persistido.
- Reparar na migração as fotos atuais em `pending`/falha sem job ativo, incluindo a foto presa mostrada nos anexos.

### 3. Corrigir duplicidade e tentativas
- Quando o mesmo checksum já existir e a foto ainda não estiver pronta, reutilizar o registro existente, garantir/reabrir seu job e acionar o worker; não tratar esse caso como mera duplicata concluída.
- Diferenciar na resposta e na interface: “já enviada e pronta” de “já enviada; processamento retomado”.
- Fazer “Tentar novamente” operar sobre o registro existente, sem novo upload e sem gerar jobs concorrentes.
- Impedir múltiplos disparos simultâneos de retry para a mesma foto.

### 4. Evitar fila infinita e estado enganoso
- Se o worker não conseguir inicializar ou processar, registrar erro acionável no job e na foto em vez de deixá-la eternamente como `pending`.
- Fazer o polling acompanhar também estados de falha recuperável e encerrar corretamente em sucesso ou falha permanente.
- Exibir estado real por foto e progresso geral; remover “foto processada” quando ela apenas foi enviada/duplicada.
- Manter a foto original preservada e somente considerar `ready` após confirmar que a versão marcada existe e não está vazia.

### 5. Bloquear publicação incompleta
- Corrigir a validação de publicação para abranger `pending`, `processing`, `failed_retryable` e `failed_permanent`.
- Antes de enviar aos sites Cordial/Morar, comparar o total de fotos ativas com as fotos realmente prontas/legadas; não permitir que uma publicação seja marcada como concluída se alguma foto foi omitida.
- Continuar enviando somente `processed_storage_path` para fotos novas, preservando a exceção explícita do acervo legado.

## Validação

- Testes unitários para enfileiramento idempotente, recuperação de duplicata pendente, retry e classificação de estados bloqueantes.
- Teste de integração com a foto real já presa: criar/reabrir job, executar worker, confirmar `ready`, arquivo marcado legível e job `succeeded`.
- Testar reenvio do mesmo arquivo antes e depois do processamento, garantindo ausência de duplicatas e de fila órfã.
- Testar que publicação é bloqueada enquanto houver foto incompleta e aceita somente quando todas estiverem prontas.
- Verificar Etapa 6 no navegador: upload, atualização automática do card, retry e ausência de loop infinito; revisar logs do worker após o teste.
