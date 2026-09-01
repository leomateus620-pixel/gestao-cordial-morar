# Descrição completa, Google Maps para todos e arquivar imóvel

## O que verifiquei agora

- **Descrição**: os textos estão completos no banco (até 2.737 caracteres, média ~600). O corte é só visual: a ficha renderiza a descrição com `line-clamp-5`, mostrando apenas 5 linhas. Nada foi perdido na importação.
- **Google Maps**: o link do Maps não depende de papel — a leitura de imóveis é liberada para todos os usuários autenticados e a ficha não esconde nada por perfil. O link some quando o imóvel não tem `logradouro`; 56 dos 812 imóveis estão nessa situação, e nesses casos ninguém vê o botão. Foi isso que pareceu "só aparece para mim".
- **Arquivar**: hoje só existe excluir. Já existem as colunas `archived_at` e `removal_state` em `properties`, a listagem já ignora arquivados, e a fila de sincronização já suporta a ação `unpublish` (tirar do site sem apagar). Ou seja, dá para montar o arquivamento reaproveitando o que existe.

## O que vou fazer

### 1. Descrição completa na ficha

Remover o corte de 5 linhas. A descrição passa a aparecer inteira, preservando parágrafos e emojis; textos longos ganham um "Ver mais / Ver menos" para não empurrar o resto da página.

### 2. Botão do Google Maps sempre disponível

O endereço para o Maps passa a usar o melhor dado existente, nesta ordem: logradouro+número+bairro+cidade+UF; senão bairro+cidade+UF; senão a localização exibida do anúncio. Assim o botão aparece para praticamente todos os imóveis e para todos os usuários (admin, corretor e secretária).

### 3. Arquivar imóvel (novo)

Ao lado de "Editar" e do ícone de excluir entra um ícone de **arquivar** (caixa/arquivo, tom neutro).

Ao clicar, uma confirmação explica o que acontece:

- Se o imóvel estiver publicado na Cordial e/ou Morar, o sistema pede a **despublicação** nos sites. O anúncio sai do ar, mas o cadastro, fotos, vídeos, códigos e histórico continuam guardados aqui.
- Se não estiver publicado, o arquivamento é imediato.

Enquanto os sites confirmam, o imóvel aparece como "Arquivamento em andamento" e fica bloqueado para publicação. Assim que confirmam, ele vira **Arquivado**: sai da lista padrão de Imóveis e passa a ser visível no filtro "Arquivados".

Na ficha de um imóvel arquivado, o mesmo botão vira **Reativar**, que traz o imóvel de volta ao catálogo (sem republicar automaticamente — a publicação continua sendo uma ação explícita).

Quem pode arquivar/reativar: admin, secretária e corretor (mesma regra da edição).

## Detalhes técnicos

1. **Migração**: nenhuma alteração de schema necessária (`archived_at` e `removal_state` já existem). Apenas garantir um índice em `archived_at` se ainda não houver.

2. **Server functions** em `src/lib/imoveis/imoveis.functions.ts`:
   - `archiveImovel({ id })`: lê `property_provider_publications`; havendo publicação viva, enfileira job `unpublish` por provedor em `property_sync_jobs` e marca `removal_state = 'pending_archive'`; sem publicação, grava `archived_at = now()` direto. Retorna `{ status: 'archived' | 'pending_archive', providers }`.
   - `unarchiveImovel({ id })`: limpa `archived_at` e `removal_state`.
   - `listImoveis`: novo parâmetro `arquivados` ("ocultar" padrão | "somente"), aplicado sobre o filtro `archived_at`.

3. **Worker/reconciliação** (`src/lib/imobibrasil/sync.server.ts` + `purge.server.ts`): quando todas as publicações de um imóvel em `pending_archive` estiverem despublicadas, gravar `archived_at` e limpar `removal_state`. Reaproveita a mesma checagem já usada por `finalizePendingRemoval`, sem apagar nada.

4. **UI**:
   - `src/components/imoveis/ArchivePropertyDialog.tsx` (confirmação + resumo do impacto).
   - `src/routes/_app.imoveis.$imovelId.index.tsx`: ícone de arquivar/reativar ao lado de excluir, selo "Arquivado" no cabeçalho, descrição sem clamp e Maps com fallback.
   - `src/hooks/useImoveis.ts`: `useArchiveImovel` / `useUnarchiveImovel` invalidando `imoveis`, `imoveis-facets`, `imovel-detalhe`, `property-sync`.
   - `CatalogHeaderControls.tsx`: filtro "Arquivados" na barra de filtros.
   - `PropertyPublishPanel`: bloqueia publicar enquanto arquivado ou em arquivamento.

5. **Validação**: typecheck, testes do serializador e conferência no preview com um imóvel publicado (arquivar → confirmar saída do site → reativar), sem publicar imóvel novo em produção.
