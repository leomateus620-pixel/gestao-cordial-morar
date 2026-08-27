# Importar os imóveis dos dois sites e tornar o Gestão Cordial a fonte oficial

## Mapa técnico do que já existe (auditado agora)

- `properties` (116 colunas, já no modelo ImobiBrasil: referência, finalidade, endereço, áreas, valores, flags de divulgação, `revision`, `is_draft`). **470 registros**, todos com `source = cordial_website` e `codigo` preenchido — vieram da importação do site da Cordial (scraping do catálogo, não da API). Zero registros Morar.
- `property_provider_publications` (vínculo por provedor, com `external_property_id`, `status`, `last_payload_hash`, `last_synced_revision`) — **0 linhas**. Ou seja: nenhum dos 470 está vinculado a um código externo ainda.
- `property_images` (storage_path, hash, ordem, capa) — **0 linhas**. É por isso que os cards mostram "Imagem não disponível".
- `property_image_provider_publications`, `property_sync_jobs`, `property_sync_attempts` — existem, vazias.
- `provider_catalog_items` — 1.669 itens de catálogo (tipos/cidades/características) já sincronizados dos dois provedores.
- Camada de saída pronta e funcionando: `src/lib/imobibrasil/client.server.ts` (token por secret, retry/backoff, erros categorizados), `serializers.ts`, `catalogs.server.ts`, `sync.server.ts` (publish/update/unpublish/delete/reconcile com lock no banco) e o worker `src/routes/api/public/hooks/property-sync-worker.ts`.
- Listagem: `listImoveis` filtra por `carteira` na própria `properties`; a aba Morar está vazia porque não há linha com `carteira = morar`.

Consequência: **nada precisa ser recriado na saída**. Falta a entrada (importação), a mídia, o vínculo externo e a UI de operação. Observação importante: este projeto é TanStack Start — não usa Supabase Edge Functions. O equivalente já adotado (e que será mantido) são server functions + rotas de worker em `src/routes/api/public/hooks/*`, com o mesmo modelo de fila persistente com lease no banco.

## O que será construído

### Fase A — Importação (Cordial e Morar)

1. **Migration** com as tabelas que faltam, sem tocar nas existentes:
   - `property_import_runs` (provedor, modo dry_run/commit/incremental, status, páginas e contadores descobertos/criados/vinculados/ambíguos/erro, checkpoint, solicitante, resumo sanitizado; índice único garantindo um run ativo por provedor);
   - `property_import_jobs` (run, tipo fetch_page/hydrate_property/download_image/finalize, página, código externo, tentativas, next_run_at, lease, erro categorizado, chave de idempotência única);
   - `property_import_candidates` (staging: payload remoto sanitizado, modelo normalizado, resultado da correspondência, confiança, motivo, imóvel local candidato, status);
   - complementos em `property_provider_publications`: `remote_observed_hash`, `last_published_hash`, `local_desired_hash`, `baseline_at`, `last_imported_at`, `system_managed`, `archived_at`, e os índices únicos `(provider, external_property_id)` e `(property_id, provider)`;
   - complementos em `properties`: `archived_at`, `archive_reason`, `removal_state`;
   - RLS: staging/jobs/runs/candidatos só para admin; leitura de imóveis mantém as políticas atuais; GRANTs explícitos.
   - Função `property_import_claim_jobs` nos moldes da `property_sync_claim_jobs` já existente (FOR UPDATE SKIP LOCKED + lease).

2. **Leitura da API** (`src/lib/imobibrasil/read.server.ts`): `/account/status`, `/imovel/lista` paginado respeitando `resultSet.total_pages`, `/imovel/dados/{codigo}`, `/imovel/{codigo}/imagem/lista`. Reutiliza o `imobiRequest` atual (header `token`, retry, sanitização).

3. **Normalizer** (`import-normalizers.ts`): remoto → modelo canônico de `properties`, com parser numérico tolerante a vírgula, endereço em array/objeto, áreas e unidades, valores/IPTU/condomínio, descrições, características agrupadas, flags de divulgação. Campo ausente vira `null`, nunca zero ou texto inventado.

4. **Worker de importação** (`src/routes/api/public/hooks/property-import-worker.ts` + `import.server.ts`), reiniciável: pega jobs com lease, busca a página, cria a próxima até o fim, hidrata cada imóvel, deduplica, faz upsert idempotente e enfileira o download das imagens. Timeout, deploy ou browser fechado não interrompem — o estado está todo no banco.

5. **Deduplicação** na ordem exigida: vínculo exato → referência/código externo do mesmo provedor → referência+finalidade+tipo+cidade+endereço normalizados → provável/ambíguo (endereço+tipo+área+valor) apenas para revisão humana → novo imóvel. Nunca mescla Cordial com Morar. Dry-run grava candidatos e contadores sem tocar em `properties`.

6. **Imagens**: valida domínio/HTTP/MIME/tamanho, faz streaming para o bucket `property-images` já existente, SHA-256 para não baixar o mesmo binário duas vezes, preserva capa e ordem, nome estável por imóvel/provedor/hash. Falha de imagem gera job de retry e não reprova o imóvel.

### Fase B — Corte: o sistema passa a mandar

- Após o commit, cada publicação vira `system_managed` com baseline de hashes.
- Editar → salva local, incrementa `revision`, enfileira `update` usando o `external_property_id` existente (nunca `inserir`) — o `sync.server.ts` atual já faz isso.
- Criar → publica no destino escolhido pelo fluxo já existente.
- Despublicar → `exibirImovel=nao`, vínculo preservado, republicável.
- **Retirar imóvel** → confirmação com nome/código/provedor, estado `pending_removal`, job de remoção, verificação por GET, e só então `archived` local. Sem hard delete; trilha de auditoria com usuário, data, provedor e resultado.
- **Reconciliação read-only** periódica: compara `remote_observed_hash` × `last_published_hash` × `local_desired_hash` e classifica `synced` / `pending` / `out_of_sync` / `missing_remote` / `external_discovered`. Nunca sobrescreve o local; abre alerta para o admin decidir entre "Reaplicar versão do sistema" ou "Importar alteração externa". Imóvel remoto desconhecido cai numa caixa de **Imóveis externos detectados**.

### Frontend

- Painel **Sincronização dos sites** (somente admin) na página Imóveis: saúde das duas contas, total remoto, vinculado/novo/ambíguo/erro, progresso real por páginas/imóveis/imagens, última importação e reconciliação, ações Analisar / Iniciar / Pausar / Retomar / Ver conflitos / Tentar erros novamente, logs sanitizados.
- Tela de conflitos com comparação lado a lado e as ações Vincular sem sobrescrever / Atualizar cadastro local / Criar separado / Ignorar.
- Listagem mantém o design atual, mas: abas alimentadas pelo vínculo de provedor (não por `carteira` fixa), contadores vindos do banco, busca por código externo/referência/cidade/bairro/tipo server-side, capa vinda do Storage, badge de provedor e selo discreto de status (Pendente, Sincronizando, Publicado, Despublicado, Divergente, Erro, Remoção pendente).
- Hooks novos ao lado dos atuais: `usePropertyImportRuns`, `usePropertyImportProgress`, `usePropertyImportConflicts`, `useStartPropertyImport`, `useResolveImportConflict`, `useRemoveProperty`, `usePropertyProviderLinks`.

## Ordem de execução

1. Migrations + RLS (nada é removido).
2. Health check `/account/status` nos dois provedores.
3. Dry-run Cordial → revisar ambíguos dos 470 → commit.
4. Dry-run Morar → commit → conferir contagens e imagens.
5. Baseline de hashes → ativar `system_managed` → ligar reconciliação periódica.
6. Validar edição de um imóvel real escolhido por você, confirmando que não duplica.

## Testes

Unitários de normalização (vírgula decimal, endereço em array, nulos), deduplicação por código/referência, hash de imagem e duplicata, paginação com múltiplas páginas e retomada após timeout, dry-run sem escrita em `properties`, update de importado usando `alterar`, despublicar preservando vínculo, remoção com falha e retry, divergência externa sem sobrescrita. Mutações contra a API real ficam mockadas; com secret real, só leitura e health check.

## Combinações antes de começar

- A importação em si é somente leitura na API — não altera nada nos sites.
- Nenhum imóvel real será alterado ou excluído como teste sem você indicar qual.
