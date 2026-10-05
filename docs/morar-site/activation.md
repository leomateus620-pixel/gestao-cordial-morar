# Ativação revisável dos 308 imóveis Morar

## Autorização recebida e limite do lote

Na sessão de **04/10/2026, America/Sao_Paulo**, o usuário respondeu **“Pode exibir esses imóveis no site.”** à anotação que identificava 363 vínculos ativos Morar, dos quais **308 sem bloqueios impeditivos**, com autorização ou disponibilidade canônica sem preenchimento. Não há timestamp exato da mensagem disponível.

A autorização abrange esses 308 imóveis e seu conteúdo canônico associado. Ela fundamenta uma decisão explícita no **canal próprio Morar**; não converte todos os valores nulos do banco em autorização nem altera disponibilidade, carteira, preços, códigos ou demais campos comerciais. Rascunhos, autorizações negativas, ocultos, arquivados, retirados manualmente e indisponíveis continuam bloqueados.

O escopo é fixado pelo SHA-256 dos IDs canônicos ordenados:

```text
6586600e3c5b214370ccd29d6670882237f66b63741644747dc3b1c65e32962b
```

Os IDs, a prova de autorização e os fingerprints completos ficam no manifesto **restrito**, dentro de `.local/`, excluído do Git e do servidor público. O arquivo real de origem é `.local/morar-site-audit/publication-candidates.json`; `candidates.json` não existe. O script recusa substituição do snapshot, expansão do escopo, duplicidades ou blocos canônicos. Novos imóveis fora desse conjunto seguem uma decisão de publicação própria separada.

## Preparação local e simulação

Na raiz do repositório, executar:

```powershell
node scripts/morar-site/activate.mjs
```

O padrão prepara `.local/morar-site-audit/activation/prepared.json` sem conexão remota. O pacote contém a autorização, os 308 IDs, revisão e fingerprint por imóvel, hashes das fontes, flags de publicação e evidências de mídia. Não contém senha, chave de serviço nem token. `_areas_m2` permanece `false`; unidades desconhecidas não são convertidas em m².

Os fingerprints locais **não são** os `snapshotHash` calculados pelo servidor. Antes de aplicar, é obrigatório obter o inventário autenticado da migração real. Quando esse serviço estiver disponível, uma simulação pode ser executada com:

```powershell
node scripts/morar-site/activate.mjs --simulate
```

Essa modalidade exige `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e uma sessão administrativa temporária em `SITE_ACTIVATION_ACCESS_TOKEN`, fornecidas pelo ambiente seguro. Não colocar valores na linha de comando, nos arquivos ou na documentação. A chave pública identifica o projeto; o token autentica o administrador. Não usar `service_role` para simular decisões editoriais.

A simulação percorre todos os cursores **duas vezes**, exige estabilidade, conserva apenas os 308 IDs autorizados e rejeita revisão alterada ou bloqueio novo. Quando há recibo de mídia, também lê todos os metadados canônicos dessas fotos e rejeita arquivos novos, removidos ou alterados desde a auditoria/recibo. Depois chama:

```text
morar_site_inventory(_cursor, _limit)
morar_site_review_batch(
  _batch_id, _items=[{propertyId, revision, snapshotHash}],
  _dry_run=true, _confirm_authorization=true,
  _confirm_availability=true, _review_media=<revisão documentada>,
  _areas_m2=false
)
```

O resultado deve declarar `dryRun:true` e `writes:0`. Ausência da migração, falha de acesso, instabilidade ou conflito interrompem a operação. O pacote local continua disponível. **`--apply` é recusado pelo script**: esta entrega prepara e simula; não aplica migração, publica no banco remoto, faz deploy ou muda DNS.

## Fotos: cobertura integral e revisão visual por amostra

O levantamento registrado verificou metadados das **4.623 fotos canônicas** do lote e **4.791 caminhos referenciados** de originais/derivados/miniaturas, sem caminhos ausentes ou externos, sem capa ausente e sem posições duplicadas. Existem 104 grupos de conteúdo duplicado para investigação; associação, ordem e registros não foram fundidos nem removidos. São 4.539 fotos legadas e 84 derivadas prontas com marca combinada.

Essa verificação integral de metadados não comprova decodificação de cada arquivo, equivalência visual integral nem direitos de terceiros. A autorização de exibição utiliza as mídias associadas no Gestão, mantendo marcas existentes. Não remove marcas nem inventa fotografias.

Por padrão, o pacote deixa `reviewMedia:false`. Para registrar a revisão, preparar um recibo restrito com:

- `scopeSha256`: o fingerprint do lote acima;
- `metadataSummarySha256`: SHA-256 do arquivo `.local/morar-site-audit/media-summary.json`;
- `reviewedBy` e `statement`: responsável e relato factual do que foi inspecionado;
- `visualSamples`: pelo menos cinco imóveis, cada um com `propertyId`, ao menos três `imageIds` realmente inspecionados e `evidencePaths` de arquivos existentes em `.local/`. Se a galeria canônica tiver menos de três fotos, inspecionar todas as fotos existentes; não completar a amostra com imagens inventadas ou de outro imóvel;
- cobertura de casa para aluguel, venda, apartamento e imóvel compartilhado. Identidades e associações são verificadas contra o snapshot.

Executar a preparação com esse recibo:

```powershell
node scripts/morar-site/activate.mjs --media-review .local/morar-site-audit/media-review.json
```

O script só marca a revisão de mídia quando o recibo corresponde à auditoria integral e a amostra válida. Não preencher o recibo apenas porque os downloads funcionaram. A preparação local de QA baixou capas dos 308 imóveis e galerias de cinco representantes; esses downloads, isoladamente, não constituem revisão visual. Relatórios do PGlite e screenshots de QA também não comprovam publicação em produção.

Na entrega atual, o recibo `.local/morar-site-audit/media-review.json` registra a inspeção visual de **14 fotos em cinco galerias**: três fotos em cada uma de quatro galerias e as duas fotos existentes no terreno. A amostra inclui casas para aluguel, venda, apartamento e imóvel compartilhado. Foram decodificados 358 arquivos canônicos no QA local. O pacote `.local/morar-site-audit/activation/prepared.json` já contém `reviewMedia:true` para os mesmos 308 IDs, com `areasM2:false`. Essa revisão é amostral; não certifica cada interior, a resolução de todas as fotos ou direitos de terceiros.

A simulação autenticada no ambiente remoto ainda não foi executada: `rpc.items` permanece `null`, aguardando o inventário da migração real. O pacote declara `activationExecuted:false`. Não houve aplicação de migração, publicação remota ou deploy.

## Aplicação posterior e conferência

A aplicação exige primeiro uma autorização específica para migração/ativação no ambiente escolhido. Depois:

1. Conferir a migração `20261004150000_morar_owned_site.sql`, schema remoto, backups e variáveis de servidor. Aplicar pelo processo operacional aprovado, começando em homologação.
2. Acessar **Configurações → Site público Morar → Administrar site → Inventário e ativação**. Levantar o inventário completo e confrontar os IDs com o manifesto autorizado. Não selecionar novos registros que tenham entrado posteriormente apenas para manter a quantidade 308.
3. Confirmar autorização e disponibilidade **do canal próprio**, conteúdo e mídia com as evidências acima. Manter áreas desconhecidas sem confirmação. Simular e conservar ID/hash do lote.
4. Aplicar o lote revisado uma única vez. O servidor verifica snapshot e revisão sob bloqueio transacional; um conflito aborta todo o lote. Repetir a mesma identificação e payload permite recuperar uma resposta perdida sem duplicação. Payload diferente com a mesma identificação é rejeitado.
5. Registrar a resposta durável (`applied:308`, IDs públicos e histórico) e conferir paginação integral, operações, referências, capas e ordem das fotos. Pendências de processamento de mídia permanecem visíveis como pendências; não são sucesso antecipado.
6. Testar `/site-morar`, busca, detalhes, mídia e atendimento sem dependência do site antigo. Somente marcar ativação concluída quando houver evidência do ambiente real. A contagem pode diminuir se surgir retirada ou indisponibilidade legítima; não remover bloqueios para cumprir um número.

Não há alteração de domínio ou indexação nesta preparação. `SUPABASE_SERVICE_ROLE_KEY` é exclusiva do servidor. Manter `MORAR_SITE_ENV` como homologação e `VITE_MORAR_SITE_PUBLIC_HOST` sem troca enquanto não houver aprovação de domínio. Não configurar `cordialgestao.com` como host público de raiz da Morar: no Gestão, a superfície continua em `/site-morar`. O domínio canônico definitivo deve ser confirmado na conta da Morar, nunca deduzido do preview.

## Rollback operacional

- Para retirar apenas o novo canal, usar “Retirar do site” na administração Morar ou a RPC administrativa `morar_site_review` com `_publish=false` para os IDs registrados no lote. Isso preserva o imóvel, os códigos, os dados comerciais, o Cordial e as integrações existentes. A retirada manual fica persistida e não é desfeita por sincronização automática.
- Home, busca, detalhes, sitemap e entrega de mídia obedecem à mesma elegibilidade. Respostas sensíveis à publicação não têm cache persistente; mídia usa revalidação em até 30 segundos. Arquivos previamente baixados por terceiros não podem ser revogados.
- Para rollback do aplicativo, restaurar a versão anterior aprovada do código. Preservar tabelas de leads, conteúdo e auditoria até exportação e conferência; não fazer `DROP` como primeiro recurso depois de receber contatos reais.
- Antes de rollback de schema, exportar entidades próprias, relações, configurações, contatos e trilha de auditoria; guardar o estado anterior e o plano SQL revisado. Testar restauração em homologação. A migração substitui `property_image_set_desired_watermark()` e `property_targets_mark_images_pending()` e seus gatilhos: preservar as definições e permissões anteriores antes de aplicar. Restaurar essas funções e gatilhos, junto com o código correspondente, antes de remover helpers ou entidades Morar dos quais dependem. Não usar `DROP ... CASCADE` para contornar dependências, nem reprocessar ou apagar fotos legadas como efeito do rollback.
- Manter os buckets originais privados, RLS e permissões de mídia durante a retirada e o rollback. A volta de versão não autoriza tornar o Storage público; conferir publicação por objeto e retirada das mídias no ambiente restaurado.
- Arquivar o imóvel inteiro segue as RPCs de arquivamento do Gestão e suas confirmações por `archive_intent_revision`; retirar somente o site Morar não autoriza arquivar a propriedade nem concluir retirada de outros destinos.
