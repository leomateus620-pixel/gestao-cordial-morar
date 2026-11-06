# ImobiBrasil OFF e publicação direta nos sites Cordial e Morar

Objetivo: o menu Imóveis passa a publicar, retirar e arquivar só nos sites próprios (cordialimoveis.com e imobiliariamorarimoveis.com.br). A ImobiBrasil fica totalmente desligada. Nenhum imóvel, foto, código ou histórico é apagado, recriado ou alterado em massa.

Conferido antes deste plano (só leitura):
- Hoje a pausa da Imobi está `paused: false` (reativada em 22/09).
- O site Cordial só publica um imóvel quando existe publicação Imobi Cordial `published`/`out_of_sync` (`cordial_site_sync_property`, linha 13). É a dependência mais perigosa.
- Todo acesso de rede à Imobi passa por `src/lib/imobibrasil/client.server.ts`. Não achei `fetch` direto para a Imobi fora dele. As outras chamadas de rede são para os workers internos, o Drive e o Google.
- `remoteCodeTaken` (codes.server.ts) consulta a Imobi quando um código é reservado.
- `registration.functions.ts` e `publish.functions.ts` chamam `enqueuePropertySyncCore`.

O trabalho é feito em 6 etapas, nesta ordem. Cada etapa só começa quando a anterior foi conferida.

## Etapa 0 — Inventário antes (só leitura)
- Gerar um retrato por imóvel com: id, códigos, operação, preço, endereço, características, responsáveis, um checksum dos campos principais, contagem e ordem das fotos, capa, e o estado em cada canal (Cordial, Morar e o legado da Imobi).
- Guardar o retrato numa tabela nova (`imobi_off_inventory`, migração aditiva, acesso só admin) e também em um arquivo em docs/.

## Etapa 1 — Desligar a ImobiBrasil (barreira central)
- Nova chave no servidor `imobi_integration` com `{ state: "off" }`. Ela é diferente da pausa antiga.
- A regra é "fechado por padrão": se a configuração faltar ou a leitura falhar, conta como OFF. Para religar, alguém precisa gravar `on` de propósito. Nenhuma tela do sistema faz isso.
- A barreira fica em `client.server.ts`, antes de ler a credencial e antes de cada tentativa de rede. Ela devolve um erro tipado `IntegrationDisabled`: não pode ser repetido e não finge sucesso.
- Os workers `property-sync-worker`, `property-media-worker`, `property-import-worker`, `property-sync-reconcile`, `property-sync-reclaim-stale`, o hotspot-cleanup e o gallery-align param a parte da Imobi. Eles continuam autenticados e respondem `200 {skipped:"imobi_off"}`.
- O processamento local de imagens, o Drive, os derivados públicos, as vitrines e o Realce continuam rodando.
- Jobs da Imobi em `pending` ou `retry` passam para `cancelled`, com motivo `imobi_off` e data. Isso usa UPDATE com WHERE (provider e status) e entra na migração como parte da mudança. O histórico é preservado.
- Locks em andamento são invalidados por uma "geração" de corte. Um worker que começou antes do corte não consegue gravar o resultado depois dele.
- `remoteCodeTaken` deixa de ser chamado. A validação de código passa a ser só local: reserva, mais índice único por imobiliária para códigos ativos. O índice só entra se as duplicidades já conhecidas permitirem; se não, ele fica `NOT VALID` e as duplicidades são listadas.

## Etapa 2 — Sites próprios sem depender da Imobi
- Nova versão de `cordial_site_sync_property`: a elegibilidade passa a ser `cordial_site_publications.state='published'` mais autorização e disponibilidade. Não depende mais de `property_provider_publications`.
- Os imóveis que já estão publicados continuam publicados, mesmo os que têm campos antigos vazios. As regras novas valem só para publicações novas.
- O gatilho em `property_provider_publications` que chama essa sincronização é removido somente depois que a nova versão estiver ativa e conferida.
- Novas RPCs por marca: `owned_site_publish(property, brand, expected_revision, idempotency_key)` e `owned_site_retire(property, brand)`.
  - A autorização é verificada no servidor: papel, acesso à marca e permissão no imóvel. O usuário vem de `auth.uid()`, nunca do navegador.
  - Elas usam controle de revisão: uma decisão mais nova nunca é sobrescrita por uma antiga.
  - Já existe `publishOwnedMorar`; a Cordial ganha a versão equivalente.
- Edição (`property_save_revision_enqueue_v2` e gatilhos): salvar atualiza o conteúdo nos canais em que o imóvel já está publicado. Não enfileira a Imobi e não reativa um imóvel retirado.
- Agenciamento e checklist: os gatilhos que esperavam a publicação na Imobi passam a reconhecer a publicação própria. A chave `property:<id>:initial-agency-listing` é mantida, sem duplicar e sem recalcular bônus.
- Marcas d'água: `property_effective_watermark_targets` e `withOwnedMorarTarget` passam a usar os destinos próprios das duas marcas. As imagens que já existem não são refeitas.

## Etapa 3 — Retirar, arquivar e reativar
- `property_retire_request`, `property_archive_finalize` e `property_unarchive`:
  - O destino Imobi entra como "legado desativado". Isso não é registrado como uma retirada confirmada.
  - O arquivamento termina assim que os sites próprios confirmarem a retirada no próprio banco.
  - Reativar um imóvel não volta a publicar nas marcas de onde ele tinha sido retirado.
- Fotos com `pending_remote_delete`: a pendência é resolvida só no banco, sem apagar arquivos. Assim nenhuma foto fica travada.

## Etapa 4 — Telas
- `PublishTargetSelector`: as opções são Site Cordial, Site Morar e Ambos, mostradas só para as marcas a que o usuário tem acesso.
- `PropertyPublishPanel` e `PropertyCatalogCard` mostram o estado de cada marca: Rascunho, Aguardando revisão, Processando fotos, Publicado, Retirado ou Pendência. Cada estado vem com o motivo, a última atualização e o botão "Ver no site".
- `CopyPublicLinkButton` monta o link com o domínio da marca e o identificador público próprio. Ele não usa mais `external_public_url`.
- `SiteSyncPanel` e `ProvidersHealthCard` mostram "ImobiBrasil: OFF" e o histórico antigo para leitura, sem botões que façam consultas.
- Conferir no celular e no computador.

## Etapa 5 — Testes, inventário depois e domínios
- Testes com dados simulados, sem publicar imóveis falsos nos sites de verdade. Eles cobrem os 12 cenários do pedido. Destaques:
  - A Imobi fica bloqueada mesmo com a credencial presente.
  - Nenhum job novo da Imobi é criado.
  - A publicação funciona só na Cordial, só na Morar e nas duas.
  - Um corretor sem acesso a uma marca não consegue publicar nela.
  - Arquivar e reativar seguem as regras da Etapa 3.
  - Repetir a mesma ação não cria duplicatas.
- Comparar o inventário de depois com o de antes, imóvel por imóvel. Edições feitas no meio do caminho são listadas à parte.
- Acompanhar uma janela de crons para mostrar que não houve nenhuma chamada nova à Imobi.
- Domínios, depois de publicar e só com sua autorização: raiz de cada marca, www, /site e /site-morar, fichas, fotos, sitemap/robots, WhatsApp, leads, e o Gestão funcionando em cordialgestao.com.

## Fora do escopo
- Excluir ou mudar anúncios na ImobiBrasil, cancelar a conta, apagar a credencial.
- Mudar dados de imóveis, fotos ou códigos.
- NFS-e, boleto, agenda.
- Publicar o sistema sem sua autorização.

## Detalhes técnicos
- Cada etapa é uma migração Drizzle aditiva em `drizzle/migrations`: CREATE OR REPLACE de funções e tabela nova com GRANT/RLS e `meta_reviewer_block`.
- O único UPDATE é o cancelamento dos jobs da Imobi, com WHERE explícito.
- Para voltar atrás, existe a versão anterior das funções (guardada em docs) e a chave `imobi_integration`. Religar a Imobi exige uma ação manual e explícita do admin.
- O AGENTS.md ganha uma regra: "ImobiBrasil OFF é fechado por padrão; publicação só pelos canais próprios".
