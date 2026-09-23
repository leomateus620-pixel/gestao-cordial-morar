
## Novo (09/09)
- [x] Enviar ao Imobi o corretor que agenciou e o proprietário (códigos internos do provedor). Pendente: nomes sem correspondência no cadastro do site (ex.: "Ricardo Caetano", "Felipe") e proprietários ainda não cadastrados lá.

- [x] Organizar fotos (arrastar/ordenar): eliminar demora e fotos que voltam para o lugar antigo; validar para corretor, secretaria e admin.

- [x] (22/09 liberado) Importar contato de proprietário do Imobi — API não expõe o vínculo imóvel↔cliente (codigoProprietario sempre 0). Evidência: docs/IMOBI-PROPRIETARIO-CONTATO.md. Depende do suporte ImobiBrasil liberar o campo no token.

## Novo (10/09)
- [x] Proprietário sumido nos painéis Cordial/Morar: fila de alterações cancelada (278 jobs) e trava `imobi_update_sync_paused` ligada. Evidência e pedido ao suporte em docs/IMOBI-PROPRIETARIO-SUMICO-10-09-2026.md + lista de 543 imóveis alterados.
- [x] Suporte restaurou os vínculos (22/09): 259/288 Cordial e 232/255 Morar; códigos gravados no Gestão. Ver docs/IMOBI-PROPRIETARIO-RESTAURACAO.md.

## Novo (11/09)
- [x] Suporte confirmou que `POST /imovel/alterar` zera campos omitidos. Envio agora lê o imóvel antes de alterar e reenvia proprietário/corretor; códigos guardados em `property_provider_publications`. Novo `GET /pessoa/dados/{codigo}` alimenta contato do proprietário na ficha interna.
- [x] Resposta pronta ao suporte em `/mnt/documents/resposta-suporte-imobibrasil-11-09-2026.md` + listas v2 com colunas para eles devolverem os códigos restaurados.
- [ ] Religar `imobi_update_sync_paused` só após teste de alteração em 1 imóvel de cada site (depende de o GET devolver o código real).

## Novo (15/09)
- [x] NFS-e Aluguéis: dados fiscais gravados (Cordial 42.767.687/0001-35 "Cordial Imoveis LTDA"; Morar 35.080.386/0001-73 "Bruna Weremchuk"; NBS 1.1001.21.00, item 10.05, ISS 3%, Simples Nacional nas duas).
- [bloqueado] Teste de emissão na prefeitura: as duas marcas retornaram "Acesso Negado" (401) — a senha do webservice salva não foi aceita. Precisa confirmar/regenerar a senha de webservice no Portal do Cidadão (menu NFS-e → Webservice), que não é a senha de acesso ao portal, e recadastrar nos segredos.
- [ ] Completar CPF/CNPJ de 2 locatários ativos (Alice Dezotti Freitas — sala 704; Caroline Fagundes/Fagundes Estética e Saúde Ltda — sala 502, ambos Morar/Clínica Cordis).

## Novo (19/09) — duplicação de anúncios e tempestade de fila de fotos
- [x] Leitura da lista do site tolerante a todos os formatos reais (`resultSet.total_data`, `root.data`, `root.imoveis`, etc.) — antes um formato não reconhecido fazia o sistema "não ver" o anúncio existente e criar outro.
- [x] Criação com trava por imóvel/site (lease de 180s no banco): dois processos simultâneos nunca chamam `/imovel/inserir` duas vezes.
- [x] Criação sem resposta (timeout/rede/5xx) entra em conferência por leitura; só cria de novo após 3 leituras confirmando ausência, e nunca se houver mais de um anúncio na referência.
- [x] Editar, adicionar ou reordenar fotos nunca cria anúncio: publicar em imóvel já publicado vira atualização, e sem código remoto com histórico vira reconciliação.
- [x] Fila de fotos coalescida: no máximo um envio pendente por imóvel/site, sempre na última versão da galeria (índice único no banco + rotina de acompanhamento).
- [x] Duplicidade registrada e exibida na tela de Integrações (somente leitura); enquanto existir, nenhum cadastro novo é criado.
- [ ] Remover no painel dos sites as fotos repetidas dos imóveis 1381/3380, 1373/3372 e 1374/3373 (manter a versão com a foto aérea demarcada). Bloqueado: a API só permite listar e inserir fotos, e o sistema não tem o código remoto de cada imagem para apagar com segurança — a exclusão precisa ser manual, com conferência visual.
- [ ] Teste final em imóvel controlado (editar + 3 fotos + reordenar) — aguardando o imóvel que pode ser usado.

## Novo (19/09, revisão pós-implementação) — fotos repetidas e destaque duplicado
- [x] Foto já sincronizada nunca é enviada de novo, mesmo que o arquivo local mude (marca d'água/reprocessamento): a divergência é registrada como `remote_content_drift`. Substituição real exige nova foto no Gestão.
- [x] Envio de foto sem repetição automática: timeout/rede/5xx passa a conferir a galeria do site por leitura — se a foto entrou, é confirmada pela contagem; se não entrou, volta à fila; se a leitura é inconclusiva, fica em `delivery_unknown` sem reenvio.
- [x] Destaque único: o envio lê a galeria do site antes de inserir; havendo qualquer destaque, toda foto nova entra sem destaque (era isso que fazia o site repetir o mesmo imóvel na listagem). 2+ destaques marcam `remote_multiple_covers`.
- [x] Indicador de fotos nunca mostra "sincronizado" quando o site tem foto sobrando ou mais de um destaque (registros antigos corrigidos).
- [ ] Limpeza manual no painel dos sites: fotos repetidas e destaques extras de 1381/3380, 1373/3372 e 1374/3373. A API não oferece excluir, reordenar nem remover destaque.

## Saneamento manual de fotos (19/09) — concluído
- [x] Snapshot GET dos 6 anúncios e confirmação de 1 cadastro remoto por referência.
- [x] Exclusão das 3 duplicatas confirmadas pelo endpoint oficial de excluir imagem
      (cordial 4350953 → 91781673; morar 4350954 → 91781532; cordial 4350931 → 91781572).
- [x] Conferência por GET após cada exclusão; aérea demarcada preservada; external_property_id inalterados.
- [x] Registro em docs/saneamento-fotos-19-09-2026.md + .json.
- [ ] Destaques duplicados e fotos antigas órfãs: só no painel dos sites (a API não permite
      tirar destaque nem substituir foto). Ver seção "Não saneado" do doc.

## Push repetido no iPhone (21/09/2026)
- [x] Envio data-only no FCM (removido `webpush.notification`): apenas o service worker exibe o aviso.
- [x] `renotify: false` com tag estável por evento — o mesmo assunto substitui a bolha em vez de empilhar.
- [x] Claim atômico da fila (`push_outbox_claim`, status `processing` + recuperação após 5 min): execuções paralelas não reenviam a mesma row.
- [x] Higiene de tokens: ao registrar, remove tokens antigos do mesmo aparelho/navegador.
- [x] Validado em produção: 1 aviso = 1 row em `notifications` + 1 em `push_outbox` (`sent`), com claim registrado.

## Reativação do envio de alterações aos sites (22/09/2026)
- [x] Alteração mínima: o Gestão envia só os campos que mudaram + os obrigatórios do contrato (`finalidade`, `codigoTipoImovel`, `referencia`). O cadastro inteiro nunca mais é reenviado (`src/lib/imobibrasil/payload-diff.ts`).
- [x] Semântica confirmada por conta na API (22/09, imóvel 1381/4355160): alteração só com os obrigatórios não mexeu em nenhum campo além de `atualizadoEm` — omitir preserva, vazio limpa.
- [x] Proprietário, corretor e usuário adicional ficam FORA do corpo da alteração; só entram por pedido explícito. `0`, vazio ou ausente = desconhecido, nunca enviado como zero.
- [x] Retrato por campo do último envio confirmado (`property_provider_publications.last_payload_snapshot/_synced_at`); imóvel antigo sem retrato usa a leitura do próprio site como ponto de partida, jamais valores padrão.
- [x] Trava de pausa aplicada imediatamente antes de cada escrita externa e com a ação efetiva (publicação que virou alteração também é barrada). Retirada do site usa alteração mínima (só o campo de exibição).
- [x] Trabalho barrado pela pausa fica retomável (`retry` em 15 min), nunca cancelado. Rotina de retomada mantém só a intenção atual por imóvel/site (`property_sync_coalesce_resume`) — revisões antigas e históricos não são reproduzidos.
- [x] Limite de 18 chamadas/minuto por site centralizado no cliente HTTP: cadastro, fotos, catálogos e limpezas passam pelo mesmo controle.
- [x] Pausa desligada em `app_settings.imobi_update_sync_paused` (configuração usada pelo ambiente publicado) e validada com imóvel real: só 5 campos enviados na primeira alteração, nenhum reenvio quando nada muda, proprietário/corretor/preço/endereço/pontos fortes intactos e página pública respondendo.

## Reativação do envio de alterações — itens 7 a 9 (22/09/2026)
- Limite por site centralizado no cliente HTTP (leitura, cadastro, catálogo, mídia, importação e retries); `Retry-After` respeitado, sem espera longa dentro do request (reagenda).
- Workers protegidos por credencial exclusiva de servidor (`WORKER_HOOK_SECRET`); chave publicável não é mais aceita. Rotinas automáticas de imóveis reconfiguradas para a nova credencial (guardada em `app_settings.worker_hook_token`).
- Painel de publicação mostra separadamente: Salvo no Gestão, Aguardando sincronização, Bloqueado e Confirmado na imobiliária.
- Validação controlada no imóvel 1381/3380: duas edições seguidas no campo interno "local da chave" chegaram à Cordial (4355160) e à Morar (4355161); nenhum outro campo mudou; IDs remotos preservados; texto de teste removido depois.

## Identidade do imóvel por destino (22/09/2026) — concluído
- Chave de intenção de cadastro (`client_intent_key`) + uma única criação em andamento no formulário: duplo clique/retry devolve o mesmo imóvel.
- Gravação, versão e fila de sincronização numa única operação no banco (`property_save_revision_enqueue`); sem gravação, nada é enfileirado.
- Conflito de versão tratável (`expected_revision`) em vez de sobrescrita silenciosa.
- Busca remota com quatro respostas (ausente/único/duplicado/inconclusivo), paginação percorrida; formato desconhecido ou falha nunca vira ausência.
- Fotos e edição nunca caem em `/imovel/inserir`: ID remoto ausente pede reconciliação.
- Trabalho com posse exclusiva por imóvel+destino (lease com token, renovação e verificação na conclusão).

## Edição confiável de todos os campos (22/09/2026) — implementado
- Contratos separados: inclusão monta o cadastro completo; alteração recebe o conjunto explícito de campos tocados (`src/lib/imobibrasil/update-contract.ts`).
- Três estados por campo (intocado / definido / limpeza intencional) em `src/lib/imobibrasil/field-state.ts`; `0` e `false` são valores, não ausência.
- Fim do `pontosFortesImovel: ""` automático: descrição e pontos fortes viajam juntos e só quando um dos dois é editado.
- Limpeza explícita habilitada para vídeo, tour, observação de valor, IPTU, condomínio, taxas, áreas, textos e demais campos editáveis — sempre exigindo que o usuário tenha tocado o campo.
- Pessoas vinculadas só por código confirmado da conta (sem escolha pelo primeiro nome parecido); homônimo vira ambiguidade registrada e vínculo desconhecido.
- Características por diferença (inserir/manter/remover) com o endpoint que desassocia só daquele imóvel; falha marca a etapa como incompleta (`characteristic_sync_incomplete`).
- Conferência campo a campo após cada escrita (`last_field_verification`): confirmado / divergente / não verificável; divergência impede o status "publicado".
- Tipo sem correspondência no catálogo do destino vira pendência acionável e retomável (`MappingPendingError`), sem adivinhar código.
- Retirada do site usa apenas identidade + `exibirImovel`; exclusão continua caminho próprio.
- Mapa de campos e limitações comprovadas em `docs/IMOBI-CONTRATO-ALTERACAO-CAMPOS.md`.
- Correção crítica achada na validação: a rotina que conclui o trabalho no banco falhava ao liberar a reserva (tipo do token), deixando os pedidos presos em "processando" e repetidos a cada minuto. Corrigida; reserva do lote também é renovada antes de cada trabalho (300s).
- Evidência (22/09, imóvel 1381/4355160 e 3380/4355161): edição do campo interno "local da chave" e depois limpeza explícita chegaram aos dois sites; conferência campo a campo confirmou referência e o campo alterado; valor, proprietário, corretor, finalidade, tipo, vídeo e pontos fortes intactos; IDs remotos preservados.

## Fotos ponta a ponta (22/09/2026)

- [x] Leitor próprio de imagem (`image-parsers.ts`): código da foto nunca vem do código do imóvel; formato desconhecido nunca é lido como galeria vazia.
- [x] Leitura COMPLETA da galeria com paginação (`image-ops.server.ts`), com estados `formato_desconhecido`, `paginacao_incompleta`, `falha_consulta`.
- [x] Exclusão pelo endpoint oficial por código, uma foto por vez, sempre conferida por leitura.
- [x] Exclusão local vira exclusão pendente por destino: registro e arquivos só saem depois da confirmação em todos os sites (`purgeFullyDeletedImages`).
- [x] Substituição de foto em passos (`replacePropertyImage` + botão na galeria): a nova assume a posição, a antiga só sai após confirmação.
- [x] Ordem e capa refeitas automaticamente (`gallery-rebuild.ts`): apaga a cauda divergente e reinsere na ordem correta, com checkpoint retomável.
- [x] Encerramento do trabalho e agendamento do seguinte na mesma operação (`property_media_finish_job`) — alteração feita durante o envio agora é processada.
- [x] Renovação de reserva e orçamento de tempo: galeria grande conclui em ciclos sem perder progresso.
- [x] Varredura automática retoma exclusões pendentes, reconstruções e versões de galeria atrasadas.
- [x] Estados distintos na tela de publicação, por imobiliária.
- [ ] Fotos antigas sobrando no site (fora do escopo por decisão): ficam listadas para decisão do usuário, nunca apagadas automaticamente.

## Fechamento da integração Cordial/Morar (22/09/2026)
- [x] Reconciliação de três estados por campo (tri-state.ts) com a mesma normalização
- [x] Referência de comparação só avança com confirmação real (fim dos três hashes iguais)
- [x] Importação incremental preservando edição e limpeza locais; divergência mantém o site e registra o caso
- [x] Eco do próprio envio (echo_payload_hash) impede ciclo importar → republicar
- [x] Leitura completa por páginas (ativos/inativos) sem remoção por ausência
- [x] Painel interno por imobiliária + diagnóstico classificado de duplicações
- [x] Suíte completa no comando de testes (268 testes) e CI de tipos + testes
- [x] Docs: IMOBI-ESTADOS-SINCRONIZACAO.md e RELATORIO-INTEGRACAO-FINAL.md
- [x] Validação real autorizada concluída no imóvel de teste 1381/3380: exclusão de foto pelo endpoint oficial (galeria conferida, original intacta), arquivamento/desarquivamento sem recriar anúncio (IDs preservados) e simulação de 429/timeout (sem retry cego em POST)
- [x] Correção: republicação voltava com o anúncio oculto. A comparação passou a usar o estado real de exibição lido no site; anúncios de teste voltaram a aparecer nas duas imobiliárias

## Consistência ImobiBrasil (plano 22/09)
- [x] Salvamento + fila numa transação, com união dos campos alterados (preço + descrição)
- [x] Comparação numérica por formato conhecido (10.5 ≠ 105; "10,50" = 10.5; zero ≠ vazio)
- [x] Importação não preenche mais campos vazios do Gestão (limpeza preservada)
- [x] Registro de divergências compatível com histórico (sem upsert no índice parcial)
- [x] Posse/lease antes de cada chamada externa e finalização condicionada
- [x] Quatro estados (desejado/tentado/observado/confirmado) por campo
- [x] Fotos: plano persistido, validação de arquivos antes de excluir, ID só com evidência
- [x] Conflito Cordial x Morar preserva o Gestão; importação com revisão esperada
- [x] Paginação completa ativos/inativos; características parciais
- [x] Limitador antes de cada tentativa; Retry-After longo reagenda o job
- [x] Estados por destino/componente na tela; testes restantes; validação no imóvel 1381/3380

## Consistência ImobiBrasil — andamento
- [x] A–C: posse/lease, followup só com posse, pré-checagem de arquivos antes de excluir fotos
- [x] Confirmação campo a campo: referência só avança com campos confirmados; divergentes voltam no próximo envio; revisão só confirmada sem pendências; leitura sem referência não conta como confirmação
- [x] Foto enviada sem código só é ligada quando aparece exatamente uma foto nova na galeria
- [x] D: conflito Cordial x Morar preserva o Gestão; importação com revisão esperada
- [x] E: paginação ativos/inativos, características por conta, ocultar/retirar/excluir
- [x] F: limitador antes de cada tentativa, Retry-After longo, limitador indisponível
- [x] G: estado por destino/componente na tela
- [x] H: validação no imóvel de teste + relatório final

## Proprietários restaurados (22/09)
- [x] Levantamento completo e gravação dos códigos
- [x] Contato do proprietário em fichas vazias (em lotes)
- [ ] Teste de edição mínima em 1 imóvel com proprietário por site — aguardando autorização do imóvel
- [ ] 50 imóveis ainda sem proprietário no site — devolver lista ao suporte

## 23/09 — divergência Gestão x sites
- [ ] Aplicar migrações pendentes (230000, 230001, 231000 feitas; faltam 031700..061000; 230002 cron adiado — depende de segredos no Vault)
- [ ] Destravar fila presa por erro desired_availability
- [ ] Número do endereço >15 (1360/1372)
- [ ] Validar 1384/1381/1373/1379 + pares Morar
- [ ] Auditoria operacional só leitura da recuperação automática (PR #26), relatório por achado
