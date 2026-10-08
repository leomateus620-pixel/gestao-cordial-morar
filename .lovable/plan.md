# Fotos travadas nos sites: destravar sem duplicar

## O que foi confirmado no código
- `media-rebuild.server.ts`: a reconstrução devolve `checkpoint: null` quando a leitura do site não é confiável (linha 144) e quando falta um arquivo (`arquivo_indisponivel`, linhas 199 e 201).
- `media-sync.server.ts` linha 812: esse `null` é gravado em `media_rebuild_state`. Isso apaga um checkpoint que estava em andamento.
- Na rodada seguinte:
  - `gallery-plan.ts` linha 92 coloca as fotos `rebuild_delete` + `pending` na lista de espera, porque "só a reconstrução pode reinseri-las".
  - A reconstrução não roda porque `stillMissing > 0` (linhas 648–658).
  - Resultado: ninguém reenvia essas fotos.
- `media-sync.server.ts` linhas 408–435: se a leitura não é confiável e há fotos "deslocadas", `reorderBlocked` esvazia a fila de envio. É por isso que nada sobe no 1377.
- `image-ops.server.ts` linha 84: qualquer erro na leitura vira `falha_consulta`, inclusive a recusa do nosso próprio limitador de requisições.
- Ainda não confirmado: os itens 4 (tentativas congeladas) e 5 (adoção de foto só com 1 órfã + 1 desconhecida). Eles serão conferidos no primeiro passo da implementação, antes de qualquer mudança.

## (a) Nunca apagar um checkpoint em andamento
- A reconstrução passa a devolver um resultado explícito:
  - `completed`: grava `null`;
  - `abandoned`: grava `null` e registra o motivo;
  - `paused`: mantém o checkpoint anterior.
- Em `media-sync.server.ts`, a gravação de `media_rebuild_state` só troca um valor não nulo por `null` quando o resultado é `completed` ou `abandoned`. Em qualquer outro caso, o checkpoint anterior (`priorCheckpoint`) é preservado.
- Leitura não confiável e arquivo indisponível passam a ser `paused`.

## (b) Recuperar fotos órfãs (`rebuild_delete` + `pending` sem checkpoint)
- Vale para fotos com `last_op = rebuild_delete`, `status = pending` e publicação com `media_rebuild_state` nulo.
- Uma leitura confiável da galeria é obrigatória. Sem ela, nada é enviado.
- Para cada foto órfã:
  - se o código remoto dela (`external_image_id`) ainda aparece no site, a foto é marcada como `synced`, sem reenvio;
  - se não aparece, `last_op` passa para `recover_send` e a foto entra na fila normal de envio, na ordem do Gestão.
- Isso fica num ajudante puro em `gallery-plan.ts` (`classifyOrphanedRebuild`). O `planGalleryDelivery` deixa de prender essas fotos quando não existe checkpoint.

## (c) Separar falta de vaga de falha real de leitura
- `acquireProviderSlot` e o `imobiRequest` passam a lançar `ProviderSlotUnavailable` quando não há vaga, quando o limite de requisições foi atingido ou quando o controle de vagas está fora do ar.
- `fetchRemoteGallery` deixa esse erro passar sem convertê-lo em `falha_consulta`.
- No worker de fotos, esse erro reagenda o job conforme o `retryAfterSeconds`, sem gastar tentativa, sem mudar o estado da foto e sem marcar `remote_read_unreliable`.
- Antes de começar uma rodada de fotos, o worker reserva vagas para as leituras previstas: no mínimo 2 (ler antes e conferir depois). Se não conseguir, adia o job inteiro.

## (d) Várias fotos com entrega desconhecida e fotos sobrando no site
- **Resolução segura:** com leitura confiável, cada foto desconhecida é casada com uma foto do site pela evidência gravada: os códigos `before_codes` e a ordem de inserção. As fotos novas do site, que não estavam em `before_codes`, são atribuídas às desconhecidas na ordem de envio.
  - O casamento só é aceito se a quantidade de fotos novas for exatamente igual à de desconhecidas.
  - Em qualquer outro caso, nada é adotado.
- **Reconstrução limpa protegida** (só pela ação do item f, nunca automática):
  - lê a galeria com segurança;
  - apaga somente as fotos do site que não têm vínculo com o Gestão ou que estão duplicadas;
  - reenvia na ordem do Gestão, com a primeira foto como capa;
  - usa o checkpoint durável já existente.
- Isso cobre as fotos sobrando no 1353, no 1373 e no 1308.

## (e) Limite de rodadas sem progresso
- Progresso = aumento de fotos `synced` ou avanço do checkpoint.
- Depois de 5 rodadas seguidas sem progresso, a publicação recebe `media_status = needs_attention` e uma mensagem clara no card da publicação, por exemplo: "Fotos paradas: 4 de 13 no site. Use Reenviar fotos."
- A espera entre tentativas passa a crescer: 2 → 10 → 30 → 120 min e depois 6 h.
- **Migração mínima necessária**, só aditiva: duas colunas nulas em `property_provider_publications`:
  - `media_no_progress_runs int default 0`;
  - `media_attention_reason text`.
- Não há alteração de dados.

## (f) Ação "Reenviar fotos" por imóvel e site
- Botão no `SiteSyncPanel`, só para administrador.
- Ele chama a função de servidor `recoverPropertyMedia({ propertyId, provider, mode })`. `mode` pode ser:
  - `resume`: aplica (b) e (d) resolução segura;
  - `clean_rebuild`: aplica (d) reconstrução limpa.
- A função confere o papel de administrador no servidor, zera o contador sem progresso e enfileira um único job `media_sync` com prioridade. Não usa SQL solto.
- A tela mostra o resultado: quantas fotos estão no site e no Gestão, e qual é a capa.
- A recuperação dos imóveis listados é feita um por vez, só com a sua autorização.

## Testes
- Checkpoint não é apagado quando a leitura não é confiável nem quando falta um arquivo.
- Fotos órfãs `rebuild_delete` são recuperadas na ordem do Gestão, sem duplicar, e uma foto cujo código ainda está no site não é reenviada.
- Recusa de vaga ou limite de requisições não marca leitura não confiável e reagenda o job sem gastar tentativa.
- Várias fotos desconhecidas: casamento exato é adotado; contagem divergente não adota nada.
- A reconstrução limpa apaga só as fotos sem vínculo ou duplicadas, e a capa é a primeira foto do Gestão.
- O limite sem progresso leva a `needs_attention` com espera crescente.
- A ação "Reenviar fotos" é recusada para quem não é administrador.
- Suíte completa e typecheck.

## Arquivos
- alterados: `media-sync.server.ts`, `media-rebuild.server.ts`, `image-ops.server.ts`, `rate-limit.server.ts`, `client.server.ts`, `gallery-plan.ts`, `image-retry.server.ts`, `SiteSyncPanel.tsx`
- novos: `media-recovery.functions.ts`, `delivery-unknown-resolve.ts` + testes

## Restrições
- Nada é publicado e nenhuma recuperação é disparada sem a sua autorização.
- NFS-e e fiscal de aluguel não são tocados.
- A sincronização Imobi não é pausada.
- Nenhum dado é alterado.
- Única migração: as duas colunas aditivas do item (e).
