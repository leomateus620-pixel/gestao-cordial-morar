# Identidade correta do imóvel em cadastro, edição, fotos e recuperação de falhas

Objetivo: cada intenção de cadastro produz no máximo um imóvel no Gestão e um anúncio por imobiliária, e qualquer repetição, retry ou falha de confirmação nunca cria um segundo anúncio — fica como pendência explícita.

## O que está confirmado hoje no projeto

- A consulta da referência no site lê **uma única página** (`/imovel/lista?referencia=...`) e, quando o formato não é reconhecido ou a consulta falha, o resultado vira "nenhum encontrado". Quem chama só distingue "achei um" de "null" — duplicidade e resultado inconclusivo caem no mesmo saco.
- A tabela de trabalhos já tem posse (`locked_by`, `lock_expires_at`) e a reserva é atômica, mas a **conclusão do trabalho não confere a posse**: um worker antigo pode marcar como concluído um trabalho já assumido por outro.
- O salvamento da edição lê a revisão, soma 1 e grava **sem conferir se alguém salvou no meio** — duas edições da mesma versão se sobrescrevem em silêncio. Salvar dados, subir a revisão e registrar os trabalhos são três passos separados: uma falha no meio pode confirmar envio sem gravação.
- O rascunho (tela de novo imóvel) não tem chave de intenção nem controle de chamada única: dois cliques rápidos criam dois imóveis.
- A referência enviada ao site é derivada do próprio identificador interno, igual para as duas contas; os códigos comerciais por imobiliária já existem separados.

## Mudanças

### 1. Identidade por destino
Cada imóvel mantém o identificador interno como única fonte de verdade. O vínculo por imobiliária passa a guardar, explicitamente, o ID remoto e a referência comercial **daquela conta**, sem nunca cruzar código da Cordial com a Morar. Com os dois destinos escolhidos, dois anúncios são o resultado esperado — nunca sinal de duplicidade.

### 2. Cadastro e rascunho idempotentes
A tela de novo imóvel passa a gerar uma chave de intenção persistente (mantida enquanto o formulário está aberto) e a compartilhar uma única chamada em andamento. O servidor grava essa chave no imóvel com restrição de unicidade: repetir a mesma intenção devolve o mesmo imóvel em vez de criar outro. Duplo clique, retry de rede e reenvio da mesma solicitação recuperam sempre o mesmo registro.

### 3. Salvar, versionar e enfileirar em uma única operação
Uma operação transacional no banco grava os dados, incrementa a revisão e registra os trabalhos de sincronização na fila existente (usada como outbox). Se a gravação falha, nada é enfileirado e o erro chega à tela; nunca se confirma envio sem gravação efetiva.

### 4. Conflito de edição tratável
A edição passa a informar a versão que estava sendo editada. Se a versão no banco já mudou, a operação devolve conflito com a versão atual, e a tela avisa para recarregar antes de salvar — sem sobrescrita silenciosa.

### 5. Criação, edição, mídia e recuperação de vínculo separadas
Edição e envio de fotos nunca podem virar criação no site. Quando o ID remoto está temporariamente ausente, o trabalho entra em reconciliação (consulta pela referência) em vez de inserir um anúncio novo.

### 6. Busca remota com quatro respostas
A consulta passa a devolver: ausência comprovada, vínculo único, duplicidade ou inconclusivo. Formato desconhecido, erro de consulta ou paginação incompleta são sempre **inconclusivo**, nunca ausência. A paginação é percorrida até o fim e o comportamento com imóveis inativos é confirmado na própria conta, em leitura.

### 7. Criação externa com intenção registrada antes
Antes de criar no site, a intenção fica gravada. Depois da resposta, o ID remoto é gravado e validado por leitura. Timeout, resposta ambígua ou falha ao gravar o ID levam à reconciliação; consultas negativas só liberam nova criação quando a leitura é conclusiva e paginada — a contagem de três consultas deixa de ser autorização por si só.

### 8. Exclusão mútua e ordem das revisões
Cada execução recebe um identificador exclusivo; o lease é renovado durante o trabalho e a conclusão só é aceita se a posse ainda for daquela execução. Revisões são ordenadas e coalescidas por imóvel e destino, para uma alteração antiga nunca chegar depois de uma recente.

### 9. Histórico preservado
Tentativas, erros e restrições de unicidade permanecem. Nenhuma duplicata existente é apagada nesta etapa.

## Testes

Duplo cadastro simultâneo; rascunho seguido de fotos; duas edições concorrentes; timeout após criação remota; falha ao gravar o ID remoto; resposta de lista em formato desconhecido; paginação; expiração do lease; sucesso na Cordial com falha na Morar.

## Detalhes técnicos

- Migração aditiva: `properties.client_intent_key` (único por usuário), `property_sync_jobs.lease_token`; vínculo por destino com referência comercial própria em `property_provider_publications`.
- RPCs SECURITY DEFINER (EXECUTE só `service_role`): `property_save_revision_enqueue(_property_id, _expected_revision, _payload, _targets)` — grava, incrementa revisão, insere jobs e devolve conflito quando a revisão divergir; `property_sync_finish_job(_job_id, _lease_token, ...)` com verificação de posse; `property_sync_renew_lease`. `property_sync_claim_jobs` passa a emitir `lease_token`.
- `reference-lookup.ts`: novo resultado `RemoteLookup = { kind: "absent" | "unique" | "duplicate" | "inconclusive" }`; `extractRemoteListItems` sinaliza formato não reconhecido em vez de lista vazia; `lookupByReference` percorre `page`/`per_page` até esgotar e marca inconclusivo em erro ou página truncada.
- `sync.server.ts`: `findRemoteByReference` devolve o resultado tipado; caminho de criação exige `kind === "absent"` conclusivo; `processJob` grava `create_state` antes do POST e reconcilia em ambiguidade; conclusão via `property_sync_finish_job`.
- `imoveis.functions.ts`: `createImovel` com `clientIntentKey` idempotente; `updateImovel` com `expectedRevision` e erro de conflito; `_app.imoveis.novo.tsx` com chave de intenção + promessa única em `ensureDraft`.
- Testes unitários novos em `src/lib/imobibrasil/reference-lookup.test.ts` e `src/lib/imoveis/` para paginação, formato desconhecido, conflito de revisão e posse de lease; validação em conta real feita apenas com leitura e uma edição controlada por destino.

## Fora do escopo

Proprietário, corretor, códigos pessoais, preço, descrição, endereço e pontos fortes seguem intocados; limpeza de fotos antigas continua manual; a pausa de sincronização permanece como está.
