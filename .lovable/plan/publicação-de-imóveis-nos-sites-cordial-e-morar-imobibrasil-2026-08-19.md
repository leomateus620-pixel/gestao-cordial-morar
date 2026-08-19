# Publicação de imóveis nos sites Cordial e Morar (ImobiBrasil)

## O que existe hoje (auditado)

- Tabela canônica única: `public.properties` — 470 registros (423 venda + 47 aluguel, todos carteira `cordial`), 30 colunas, unique `(source, source_property_id)`. Nenhum registro será removido ou truncado.
- Módulo Imóveis: `src/lib/imoveis/imoveis.functions.ts` (server functions com `requireSupabaseAuth`), `src/hooks/useImoveis.ts`, `src/routes/_app.imoveis.tsx`, `_app.imoveis.$imovelId.tsx`, `_app.imoveis-destaque.tsx`, cadastro no sheet estreito `src/components/sheets/novo-imovel.tsx`.
- **Não existe hoje**: imagens de imóvel (nenhuma tabela, nenhum bucket), campos de endereço detalhado, condições comerciais, conteúdo/SEO, corretor/proprietário do imóvel, nem qualquer noção de publicação externa.
- O projeto é TanStack Start: **não usa Supabase Edge Functions**. A estrutura pedida em `supabase/functions/...` será implementada com responsabilidade idêntica em `src/lib/imobibrasil/*` (client, providers, schemas, serializers, errors, idempotency) + server functions autenticadas + rotas internas `src/routes/api/public/hooks/*` acionadas por `pg_cron`/`pg_net` com secret próprio. Nenhuma chamada à ImobiBrasil sai do navegador.

## Entrega em 4 fases

O escopo é grande demais para uma única entrega verificável. Cada fase termina com build, typecheck, lint e testes passando, e o sistema permanece utilizável entre elas.

### Fase 1 — Modelo de dados e núcleo de integração (sem UI nova)
- Migration aditiva em `properties`: identificação (referência local, finalidade venda/locacao/temporada, corretor, proprietário, origem da captação, status rascunho/publicado), endereço completo (CEP, logradouro, número, complemento, zona, região, ponto de referência, condomínio, regra de exibição), áreas `numeric`, composição, comercial (IPTU, condomínio, taxas, observação de valor, flag consulte), conteúdo/SEO, documentação e divulgação, empreendimento/terreno. Todas nullable com default seguro — os 470 registros continuam válidos.
- Novas tabelas com UUID, timestamps, FKs, índices, GRANTs e RLS: `property_images` (+ bucket privado `property-images`), `property_provider_publications`, `provider_catalog_items`, `provider_type_map`, `provider_city_map`, `provider_characteristic_map`, `provider_area_unit_map`, `provider_person_map`, `property_image_provider_publications`, `property_sync_jobs`, `property_sync_attempts`.
- Função Postgres de aquisição de job com `FOR UPDATE SKIP LOCKED`, lease/timeout e recuperação de jobs abandonados. RLS: leitura de status pelo escopo do usuário; escrita de IDs externos/jobs somente pelo service role.
- Módulo compartilhado `src/lib/imobibrasil/`: allowlist de providers, client `fetch` com token em header, AbortController, timeout, correlation ID, retry exponencial com jitter (rede/429/5xx), normalização de erro (não-2xx, `status:false`, `message|resultSet|error|texto`), sanitização (token nunca em log/erro/resposta), idempotência.
- Serializers com Zod (modelo local ≠ payload externo): omissão de vazios, `venda|locacao|temporada`, vírgula decimal (`140,80`), `sim/não` no JSON e `sim/nao` na imagem, `Personalizado`, `tipoareaConstruida`, referência externa estável derivada do UUID, hash determinístico do payload, `descricaoTipoImovel` só no insert.
- Testes unitários de serializer, mapeamento por provedor e normalização de erro.

### Fase 2 — Fila, worker e reconciliação
- Server functions: `enqueuePropertySync` (valida JWT/papel/escopo, registra alvos, enfileira revisão, nunca chama provedor na requisição), `getPropertySyncStatus`, `retryPropertySync`, `reconcileProperty` (admin).
- Rota interna `/api/public/hooks/property-sync-worker` protegida por secret, agendada por `pg_cron` em intervalo curto e acionada após enqueue.
  - Publicar: saúde da conta → resolve tipo/cidade/características no catálogo do destino → busca a referência em `/imovel/lista` (idempotência antes do insert) → `POST /imovel/inserir` → extração tolerante do ID → confirmação por `/imovel/dados/{id}` → características → imagens (capa primeiro, `destaque=sim`, baixadas do Storage server-side, dedupe por hash, concorrência limitada) → verificação remota → `published`.
  - Atualizar: `POST /imovel/alterar/{id}` com código no path **e** no header; apenas diffs de características/imagens; nunca duplica.
  - Despublicar: update com `exibirImovel=não`. Excluir remoto: ação administrativa separada e confirmada.
  - Timeout de insert = resultado ambíguo: reconciliar por referência antes de qualquer reenvio; 400 aguarda correção; 401 não entra em loop.
- Rota `/api/public/hooks/property-sync-reconcile` (agendada + manual): read-only, marca divergência, nunca sobrescreve o local.
- Server function autenticada de catálogos: `/account/status`, cidades, tipos, características, com cache TTL em `provider_catalog_items` e busca de códigos por provedor. Códigos da Cordial nunca reaproveitados na Morar.
- Testes: 200 com `status:false`, 400, 401, 429, 5xx, timeout, HTML inesperado, JSON inválido, fila/retry/lock expirado/job duplicado, RLS e papéis.

### Fase 3 — Novo cadastro em rota dedicada
- Rotas `/imoveis/novo` e `/imoveis/:id/editar` substituindo o sheet atual. Desktop: duas colunas, stepper lateral e resumo fixo de publicação. Mobile: coluna única, seções expansíveis, rodapé de ações fixo.
- Seis etapas: Destino e identificação · Localização · Características e áreas · Valores e condições · Conteúdo e mídia · Divulgação e revisão.
- React Hook Form + Zod, validação por etapa, preflight por provedor, campos condicionais (locação, temporada, terreno, condomínio, empreendimento), formatação PT-BR na tela e valor canônico no banco, "Salvar rascunho" (nunca chama API) separado de "Salvar e publicar", proteção contra perda de alterações, foco no primeiro erro, acessibilidade por teclado. Default incorreto `SP` removido.
- Componentes: `PropertyFormPage`, `PublicationTargetSelector`, `PropertyIdentificationSection`, `PropertyAddressSection`, `PropertyFeaturesSection`, `PropertyCommercialSection`, `PropertyMediaUploader` (drag-and-drop, reordenação, capa), `PropertyVisibilitySection`, `PropertyReviewPanel`, `ProviderSyncStatusCard`, `ProviderMappingAlert`, `SyncStatusBadge`.
- Hooks: `useProperty`, `usePropertyForm`, `useProviderCatalogs`, `usePropertyImages`, `useSavePropertyDraft`, `usePublishProperty`, `usePropertySyncStatus`, `useRetryPropertySync` (TanStack Query, refetch progressivo enquanto houver job ativo — sem polling agressivo).

### Fase 4 — Listagem, painel de saúde e validação final
- Listagem: busca, filtros Venda/Aluguel e abas Todas/Cordial/Morar passam a derivar das publicações reais; chips Cordial/Morar, status por destino, última sincronização, menu de ações (editar, publicar, retry, reconciliar, despublicar) conforme permissão; filtros por provedor e situação; paginação mantida. "Publicado" só após verificação remota.
- Visão administrativa de saúde: `/account/status` dos dois provedores, fila pendente, falhas recentes, retry/reconcile.
- Health checks read-only ao vivo nos dois provedores e relatório final (arquivos, migrations, tabelas, índices, RLS, rotas, scheduler, componentes, hooks, resultados de build/lint/typecheck/testes, campos sem mapeamento confirmado, passo manual da primeira publicação real).

## Secrets necessários

`IMOBIBRASIL_CORDIAL_TOKEN`, `IMOBIBRASIL_MORAR_TOKEN` e um secret interno do worker (`PROPERTY_SYNC_WORKER_SECRET`). Serão solicitados pelo formulário seguro na Fase 2 — não envie valores no chat.

## Limites assumidos

- Nenhum imóvel real será criado ou excluído nos sites sem sua confirmação explícita; a validação ao vivo fica restrita a leitura (`/account/status`, catálogos) até você autorizar a primeira publicação.
- Códigos numéricos jamais são adivinhados: sem catálogo ou mapeamento confirmado, o campo opcional é omitido e um alerta de mapeamento aparece no formulário.
