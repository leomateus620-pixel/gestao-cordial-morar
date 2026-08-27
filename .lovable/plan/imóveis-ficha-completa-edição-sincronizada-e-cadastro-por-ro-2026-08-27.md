# Imóveis: ficha completa, edição sincronizada e cadastro por rota

## Mapa de impacto (auditoria feita)

- Listagem: `src/routes/_app.imoveis.tsx` + `listImoveis` (`src/lib/imoveis/imoveis.functions.ts`).
- Card: `src/components/imoveis/PropertyCatalogCard.tsx` (já é `Link`, mas visualmente enxuto e sem menu de ações).
- Detalhe: `src/routes/_app.imoveis.$imovelId.tsx` existe, porém raso — sem galeria, sem seções, sem edição, sem imagem (usa placeholder fixo).
- Cadastro: modal legado `src/components/sheets/novo-imovel.tsx` com ~14 campos e UF fixa `SP`.
- Backend já pronto e reutilizável: `property_provider_publications`, `property_images`, `property_sync_jobs`, `enqueuePropertySync`/`getPropertySyncStatus` (`publish.functions.ts`), worker `api/public/hooks/property-sync-worker`, reconcile diário.
- A tabela `properties` já tem os ~119 campos canônicos (endereço, áreas, valores, documentação, empreendimento, divulgação, SEO, características JSON). **Nenhuma migration nova de schema é necessária** para a ficha e a edição.

### Causa do bug Cordial x Morar

A aba de carteira filtra `properties.carteira` (coluna herdada da importação), enquanto o chip do card vem de `property_provider_publications`. Um imóvel importado com `carteira = 'cordial'` mas publicado na Morar aparece na aba Cordial com chip "Morar · Publicado", e os contadores das duas abas ficam iguais/errados. Correção: filtrar e contar pelo vínculo real em `property_provider_publications` (aba = existe vínculo ativo naquele provedor), mantendo `carteira` apenas como metadado de origem.

## O que será construído

### 1. Rotas reais
- `/imoveis` (lista, preserva aba/busca/filtros/scroll via search params na URL)
- `/imoveis/novo` (cadastro em etapas)
- `/imoveis/:propertyId` (ficha)
- `/imoveis/:propertyId/editar`

Chave é sempre o UUID local. Desktop: ficha em painel lateral amplo (720–900 px) orientado pela rota; mobile/tablet: página full-screen. Deep link e botão voltar funcionam nos dois casos.

### 2. Consulta de detalhe
Nova server fn `getPropertyDetail` (projeção completa + imagens assinadas em lote + publicações + jobs recentes, sem N+1). `listImoveis` continua leve, ganha filtro por provedor e contagem server-side coerente.

### 3. Ficha do imóvel
Cabeçalho (tipo, referência, finalidade, valor, chips por provedor com status independente, Editar / Sincronizar / menu), galeria com thumbnails, lightbox, teclado e swipe, grade de fatos (sem exibir 0 falso), e seções: Visão geral, Localização, Características, Áreas e terreno, Valores e condições, Documentação e captação, Empreendimento, Divulgação, Sincronização. Tudo em labels PT-BR formatados — sem JSON bruto.

### 4. Edição
`/imoveis/:propertyId/editar` reusa o mesmo formulário do cadastro, pré-preenchido. Salva no banco, incrementa `revision` e enfileira `action: "update"` para cada provedor **já vinculado** (nunca `publish`/insert), usando o `external_property_id` existente. Estado imediato "Alterações salvas · sincronização pendente"; "Sincronizado" só após verificação remota. Falha externa não desfaz a edição local; retry isolado por provedor. Aviso de alterações não salvas e bloqueio de submissão duplicada.

### 5. Cadastro (substitui o modal)
Rota em 6 etapas: Destino e identificação → Localização → Características e áreas → Valores e condições → Descrição e mídia → Divulgação e revisão. Destino Cordial, Morar ou ambos, com jobs independentes. "Salvar rascunho" não chama API; "Cadastrar e publicar" usa a fila existente. Upload no Storage com ordenação e definição de capa antes do job. UF padrão passa a ser RS (config da organização), removendo o `SP` fixo.

O modal `novo-imovel.tsx` é excluído; o FAB e um novo botão "Novo imóvel" no cabeçalho desktop navegam para `/imoveis/novo`.

### 6. Cards
Mesma rota de detalhe no clique, foco visível, Enter/Espaço, menu contextual (Ver detalhes, Editar, Sincronizar, Despublicar conforme permissão) que não dispara a navegação. Layout responsivo: coluna no mobile, linha compacta no desktop médio e distribuição em duas colunas no desktop amplo — eliminando o vazio atual. Só a capa é carregada na lista.

## Notas técnicas

- Permissões e RLS atuais preservados; publicação continua restrita pelo escopo de `user_agencies`/admin já implementado em `assertProviderScope`.
- Nenhuma chamada ImobiBrasil no browser: hooks falam com Supabase e com as server fns existentes.
- Hooks: `usePropertyDetail`, `useUpdateProperty`, `useCreatePropertyDraft`, `usePublishProperty`, `usePropertySyncStatus`, `useRetryPropertySync`, além dos atuais.
- Invalidação de cache por chave (`["imovel", id]` e página da lista), sem recarregar o catálogo inteiro.
- Testes: unitários dos normalizadores/serializadores de formulário e do filtro por provedor; verificação de build, lint e typecheck. Nenhum imóvel real será criado, editado ou despublicado nos sites sem sua confirmação explícita.

## Pergunta única antes de executar

Para validar edição real ao final, você prefere que eu apenas prepare o passo manual (você escolhe o imóvel e clica em salvar), ou autoriza uma edição real de baixo risco (ex.: ajuste de descrição) em um imóvel que você indicar?
