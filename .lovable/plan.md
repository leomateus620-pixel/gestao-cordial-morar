# Linha do tempo de histórico do imóvel

## O que o usuário verá
Na ficha do imóvel, uma seção "Histórico" com linha do tempo vertical: ícone por tipo, título ("Editado Características", "Imagem adicionada (Total: 8)", "Ordem das imagens alterada", "Editado Dados Privados"), data/hora de Brasília, chip "por Fulano" e seta para abrir o detalhe (campo: antes → depois). Filtro por tipo e botão "Carregar mais". Sem histórico anterior: "O histórico começa a partir de <data da ativação>". Nada retroativo é inventado.

## Etapa 0 — Conferência somente leitura (antes de qualquer SQL)
Os itens do seu mapeamento ainda não foram conferidos no banco nesta conversa; a primeira etapa confirma:
- lista real das 129 colunas de `properties` e quais são técnicas (sync, hashes, intents, locks);
- triggers existentes em `properties`/`property_images`/`property_videos`/`property_provider_publications` e a ordem em que disparam;
- regra de leitura de `properties` (função usada nas políticas) e regra de "pode ver dados privados" já existente;
- volume de UPDATEs/dia em `properties` e `property_images` (para estimar linhas/dia do histórico);
- formato dos dados de `property_archive_events` e vínculos de proprietário.
Se algo divergir do mapeamento, ajusto a lista de campos antes de aplicar.

## Etapa 1 — Migração aditiva (uma só)
1. Tabela `public.property_history` com as colunas pedidas (`id, property_id, actor_user_id, actor_name, actor_kind, category, title, summary, changes jsonb, request_id, created_at`).
   - `property_id` com FK **ON DELETE CASCADE**: imóvel excluído de fato já é raro (arquivamento é o fluxo normal) e evita histórico órfão; SET NULL deixaria eventos sem dono visível por RLS. (Pergunta 1.)
   - CHECK em `actor_kind` e `category` (valores fixos, imutáveis — permitido em CHECK).
   - Índices: `(property_id, created_at desc)` e `(property_id, category, created_at desc)`.
   - GRANT SELECT a authenticated, ALL a service_role, REVOKE de anon/PUBLIC; RLS ativo; só política SELECT usando a mesma função de acesso de `properties`. Sem INSERT/UPDATE/DELETE pelo cliente.
2. Funções `SECURITY DEFINER` com `search_path` fixo:
   - `property_history_actor()`: usa `auth.uid()`; senão `current_setting('app.actor_id'/'app.actor_kind'/'app.request_id', true)`; senão "Sistema". Nome do ator lido de `profiles` uma vez por evento (consulta por chave primária).
   - `property_history_record(...)` interna (sem EXECUTE para anon/authenticated).
   - `property_history_with_actor(actor_id, actor_kind, request_id)` para o servidor marcar a transação (`set_config(..., true)`), executável só por service_role.
3. Triggers (todos leves: sem `net.http`, sem laços sobre tabelas, sem leitura de outras tabelas além do nome do ator):
   - `properties` AFTER INSERT → evento "Imóvel cadastrado".
   - `properties` AFTER UPDATE `WHEN (OLD.* IS DISTINCT FROM NEW.*)`: compara só a lista branca de colunas por seção (abaixo); gera **um evento por seção alterada** no mesmo salvamento; se nada relevante mudou, não grava nada.
   - `property_images` triggers de **statement** com transition tables (INSERT/DELETE/UPDATE): um evento por comando — adicionadas/removidas com total atual, "Ordem das imagens alterada" quando só posição muda, "Capa trocada" quando `is_cover` muda, "Imagem substituída" quando o arquivo muda. Colunas de pipeline (marca-d'água, status, variantes, publicação por provedor) ignoradas.
   - `property_videos`: adicionado/removido (statement).
   - `property_provider_publications`: só transições de status para publicado, despublicado, erro, conflito (status antigo ≠ novo); tentativas e reprocessamentos não geram evento.
   - Arquivamento/reativação: a partir de `removal_state`/`archived_at` em `properties` (sem tocar nas RPCs de arquivamento).
   - Agenciamento e vínculo de proprietário Imobi: evento quando muda o vínculo (a confirmar na Etapa 0 se ficam em colunas próprias).
4. Agrupamento por `request_id`: o reorder de N fotos é um único UPDATE em lote? A Etapa 0 confirma; se a função atual fizer N updates, o servidor passa a enviar um `request_id` e o trigger de statement funde eventos do mesmo `request_id` em um (atualiza o evento existente da mesma transação em vez de criar outro).

## Seções e campos (lista branca, ajustada na Etapa 0)
```text
caracteristicas : tipo, dormitorios, suites, banheiros, vagas, salas, areas*, mobiliado
valores         : valor, valor_modo, valor_exibido, valor_iptu, valor_condominio, aceita_financiamento, permuta
endereco        : cep, logradouro, numero, complemento, bairro, cidade, uf, zona, regiao, exibir_endereco_site, localizacao_exibida, localizacao_maps_url
descricao       : descricao_imovel, pontos_fortes, nome_empreendimento, unidade
operacao        : carteira, operacao, finalidade, disponibilidade, exibir_imovel, destaque_inicial
documentacao    : exclusividade, autorizacao, escriturada, averbada, com_placa
codigos         : codigo, codigo_cordial, codigo_morar, referencia
publicacao      : publish_targets
corretor        : corretor_id/corretor_nome, origem_captacao
dados_privados  : proprietario_nome/telefone/email, valor_observacao, observacao_imovel, outras_informacoes, local_chave  (sensitive)
arquivamento    : removal_state, archived_at
```
Ignoradas: `updated_at`, `revision`, intents/hashes/locks, estados de sync, colunas de importação.

## Etapa 2 — Servidor
- Novo `src/lib/imoveis/history.functions.ts`: `listPropertyHistory({ propertyId, cursor, category })` autenticada (RLS como usuário), 20 por página, cursor `(created_at, id)`. Remove valores de campos `sensitive` no servidor quando o usuário não pode ver dados privados (resposta "Dados privados alterados" sem valores).
- Novo `src/lib/imoveis/history-labels.ts` (puro): rótulos por campo/seção, formatação R$, Sim/Não, enums (operação, tipo, status), datas BRT (`src/lib/dates.ts`), listas.
- Marcar o ator nos caminhos sem usuário (service role) com `property_history_with_actor`: sync Imobi (`src/lib/imobibrasil/*`) → "Sync Imobi"; workers/Drive/pipeline → "Sistema"/"worker"; ações confirmadas do assistente → "Assistente" com o usuário que confirmou. É só uma chamada no início da operação; **nenhuma regra de sync, envio, fotos ou Drive muda**. Se preferir zero toque nesses arquivos, eles aparecem como "Sistema" (Pergunta 2).
- Reorder/replace em `media.functions.ts`: só envio de `request_id`, sem mudar a lógica.

## Etapa 3 — Tela
- `src/routes/_app.imoveis.$imovelId.index.tsx`: seção "Histórico".
- Novo `src/components/imoveis/PropertyHistoryTimeline.tsx` (ícone por categoria, chip "por Fulano", expandir detalhe, filtro, carregar mais) e hook `usePropertyHistory` em `src/hooks/useImoveis.ts`; invalidação junto com as do imóvel. Ajustar cores do `Timeline` compartilhado para tokens do tema se reutilizado.

## Etapa 4 — Testes
- Rótulos/formatação (puro).
- Banco isolado (padrão `tests/*/database.ts`): evento por seção; agrupamento de vários campos; update só de `updated_at`/sync → nenhum evento; reorder de N fotos → 1 evento; ator usuário/Sistema/Sync Imobi; RLS: corretor sem acesso não vê; authenticated não insere/altera/apaga; sensitive oculto para corretor e visível para admin/secretária.
- `bun run test`, `test:site` e typecheck; regressões de endereço, fotos (ordem/envio), códigos, sync Imobi, Drive, NFS-e.

## Ordem de execução
Etapa 0 → migração → servidor → tela → testes → relatório com estimativa de linhas/dia. Sem publicar.

## Riscos
- Trigger com erro bloquearia o salvamento: as funções de histórico tratam falha só da gravação do histórico com `EXCEPTION` + `RAISE WARNING` (o salvamento continua), e testes cobrem cada caminho.
- Carga no banco: eventos só em mudança real; sync sem mudança não escreve nada. Retenção fica para depois.
- Ordem com triggers existentes (sync Cordial/Morar, propagação de códigos): AFTER, sem alterar `NEW`; não interfere.
- Mudanças em lote feitas pelo sistema (ex.: propagação de códigos) aparecem como "Sistema".

## Perguntas
1. Exclusão definitiva do imóvel apaga o histórico junto (CASCADE, proposto) ou prefere manter?
2. Posso adicionar a marcação de ator ("Sync Imobi"/"Sistema") nos arquivos de sync e workers, sem mudar sua lógica?
3. Quem vê dados privados no histórico: só admin e secretária, ou também o corretor responsável pelo imóvel?
