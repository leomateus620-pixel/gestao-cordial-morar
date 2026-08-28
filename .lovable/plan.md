# Fotos com marca-d'água e Google Drive: correção definitiva

## Causa real dos dois problemas (verificada agora)

**Fotos lentas/falhando**
- O envio de cada foto espera o processamento acontecer dentro da mesma requisição: o navegador só recebe resposta depois que a marca é aplicada. Com foto grande isso estoura o limite de tempo/memória do servidor e a etapa parece travada.
- O envio é sequencial (uma foto por vez), sem prévia local, sem barra de progresso individual e sem retomada após atualizar a página.
- A fila de processamento está vazia (0 trabalhos) e as 11.554 fotos existentes são todas importadas dos sites, ou seja, nenhuma foto nova chegou a passar pelo fluxo novo.

**Drive instável**
- A sincronização tenta resolver o imóvel inteiro em uma única execução (baixar do armazenamento + enviar ao Drive, arquivo por arquivo). Em lotes grandes ela é interrompida no meio.
- Vídeos grandes não guardam o ponto de retomada: uma interrupção recomeça do zero.
- Hoje o Drive aceita fotos ainda sem marca.

## Decisões confirmadas

- Fotos importadas dos sites não serão reprocessadas em massa; continuam válidas e podem ir ao Drive.
- Fotos novas são redimensionadas no navegador (lado maior 2560px, qualidade alta) antes do envio.

## O que muda na prática

**Etapa 6 — Fotos**
- Prévia da foto aparece na hora, antes de qualquer envio.
- Até 3 envios simultâneos, com progresso por foto e progresso geral.
- Estados claros por foto: Enviando, Aplicando marca, Pronta, Erro — tentar novamente.
- Uma foto com erro não bloqueia as outras; existe "tentar novamente" individual, sem reselecionar o arquivo.
- Fechar, atualizar ou trocar de etapa não perde nada: o estado vem do servidor.
- Marca sempre Morar + Cordial, aplicada a partir do original preservado; repetir a tentativa nunca aplica marca duas vezes.

**Etapa 8 — Drive**
- Uma única pasta por imóvel, criada por identificador (nunca por busca de nome), com recuperação apenas das subpastas ausentes.
- Envio em blocos: cada execução envia um pedaço e a próxima continua, sem interrupção no meio do lote.
- Vídeos grandes retomam do último ponto confirmado.
- Renovação de credencial e espera progressiva quando o Google limita as chamadas.
- Estados visíveis: Preparando pastas, Enviando 6 de 12, Verificando arquivos, Sincronizado, N com erro; com "tentar novamente" por arquivo e por categoria, e "abrir pasta no Drive".
- Fotos novas só vão ao Drive depois de prontas com marca. Falha no Drive nunca apaga imóvel, agenciamento ou publicação.

**Checklist do agenciamento**
- "Fotos enviadas ao Drive" só conclui quando todas as fotos ativas estiverem confirmadas nas subpastas corretas; foto nova ou com erro volta o item para pendente, sem duplicar contagem ou bonificação.

## Detalhes técnicos

Banco (migração)
- `property_images`: novos estados `uploading`, `processing`, `failed_retryable`, `failed_permanent` (mantendo `pending`/`ready`/`legacy` para compatibilidade), coluna `processing_started_at` e `processing_finished_at` para medir p50/p95.
- `property_image_jobs`: índice em `(status, run_after)` e função de recuperação de leases vencidos (`property_image_reclaim_stale`), acionada pelo cron.
- `property_drive_files`: colunas `resumable_session_url`, `resumable_offset`, `resumable_expires_at` para checkpoint de vídeo.
- `property_drive_jobs`: coluna `cursor` (categoria + último índice) para retomada em blocos.

Fotos
- `src/hooks/usePropertyMedia.ts`: prévia local por `URL.createObjectURL`, redimensionamento com `createImageBitmap` + canvas (respeitando EXIF), pool de concorrência 3, progresso por arquivo, retry individual, sem `await` do processamento.
- `src/lib/imoveis/media.functions.ts`: `registerPropertyImage` deixa de chamar `runImageWorker` inline; apenas enfileira e dispara o worker (fire-and-forget). Retorna a linha da foto imediatamente.
- `src/lib/imoveis/image-pipeline.server.ts`: worker processa 2 jobs por execução, verifica leitura do arquivo final no armazenamento antes de marcar `ready`, distingue erro temporário (retry com backoff) de permanente, e reenfileira-se enquanto houver fila.
- `src/lib/imoveis/watermark.server.ts`: templates decodificados uma única vez em cache de módulo (hoje o Base64 é convertido a cada foto).

Drive
- `src/lib/imoveis/drive/property-drive.server.ts`: `syncPropertyDrive` passa a processar um bloco limitado (ex.: 8 arquivos ou orçamento de tempo) e devolver `hasMore`; o job persiste o cursor e reenfileira. Envio resumível grava a sessão e o offset; verificação de nome/pasta/tamanho antes de confirmar. Fotos `pending`/`processing` não são enviadas; `legacy` continua permitida.
- `src/routes/api/public/hooks/property-drive-worker.ts` e `property-image-worker.ts`: encadeamento automático enquanto restar fila, mantendo o cron de 1 minuto como rede de segurança.

Interface
- `src/components/imoveis/PropertyPhotosStep.tsx` e `PropertyDriveStep.tsx`: progresso individual e geral, mensagens em linguagem do corretor (sem stack trace, bucket, checksum ou IDs), skeletons sem salto de layout, responsivo.

Testes
- Unitários: classificação de orientação, nomes de arquivo, mapeamento de erro para mensagem, redimensionamento, idempotência de chave (checksum + variante + versão).
- Integração: enfileiramento e reprocessamento sem marca dupla, recuperação de lease vencido, retomada de bloco do Drive, estrutura parcial de pastas.
- Ponta a ponta com Playwright autenticado: upload múltiplo, foto horizontal/vertical/quadrada, arquivo grande, atualização da página durante o processamento, retry, e sincronização do Drive em pasta de testes controlada (nenhum arquivo real alterado).
- Lint, typecheck, build e migrações ao final, com métricas p50/p95 antes e depois.
