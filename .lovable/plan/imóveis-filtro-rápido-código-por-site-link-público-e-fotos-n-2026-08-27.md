# Imóveis: filtro rápido, código por site, link público e fotos na etapa 6

## Mapa de impacto (o que já existe e será reutilizado)

Auditoria feita no código atual:

- **Listagem**: `listImoveis` em `src/lib/imoveis/imoveis.functions.ts` já pagina no servidor, mas só aceita carteira, operação, tipo, cidade, bairro e busca textual. O filtro por carteira carrega **todos** os vínculos e **todos** os ids do catálogo em memória antes de filtrar — será substituído por consulta com índice. A tela `_app.imoveis.index.tsx` guarda filtros só em `useState` (perde estado ao voltar da ficha).
- **Publicações**: `property_provider_publications` já tem `external_property_id`, `external_reference`, `external_public_url`, `status`, `last_verified_at`, hashes e revisão. Não é preciso tabela nova para links — só popular e verificar o que já existe.
- **Fotos**: `property_images` (storage_path, content_hash, position, is_cover) e `property_image_provider_publications` (external_image_id, status, content_hash) já existem; o worker `sync.server.ts` já envia imagem por multipart em `/imovel/{id}/imagem/inserir` com flag de destaque. Falta: UI de upload, ordenação/capa/remoção e o diff de remoção externa.
- **API real**: existem `/imovel/lista?referencia=`, `/imovel/dados/{id}`, `/imovel/{id}/imagem/lista`, `/imovel/inserir`, `/imovel/alterar/{id}`. Não há endpoint de "próximo código livre" — a checagem de disponibilidade usará `imovel/lista?referencia=` + reconciliação do índice local importado.
- **Não existe** nenhum mecanismo de reserva de código — é a única tabela nova do plano.
- Wizard atual tem 6 etapas, sendo a 6ª "Divulgação e revisão" (sem fotos).

## 1. Filtro rápido na listagem

Barra compacta abaixo do cabeçalho, com identidade própria do sistema (sem copiar o visual do site): busca única (código, tipo, endereço, bairro, cidade), seletor de imobiliária (Todas / Cordial / Morar / Cordial + Morar), finalidade, cidade, tipo, botão "Mais filtros" e "Limpar" só quando houver filtro ativo.

Em "Mais filtros" (popover no desktop, bottom sheet com "Aplicar filtros (N)" no mobile): bairro, faixa de valor, dormitórios/suítes/banheiros/vagas mínimos, área mín./máx., status de publicação e ordenação (atualização, código, preço asc/desc, área).

Comportamento: chips de filtros ativos removíveis, contagem real de resultados, skeleton, empty state com "Limpar filtros", debounce de 350 ms só no texto, alvos de toque de 44 px no mobile.

Estado sincronizado na URL (searchParams) para preservar filtros, página e origem ao voltar da ficha.

## 2. Código automático e seguro por imobiliária

Na etapa 1, ao escolher o destino, o sistema reserva o próximo código livre de cada site escolhido (dois campos independentes quando forem os dois). Estados visíveis: buscando, reservado, indisponível, não validado, com ação "Gerar outro código". Campo somente leitura por padrão; edição manual exige ação explícita e revalidação.

Backend: nova tabela de reservas com unicidade por (provedor, código), reserva atômica via função no banco com advisory lock por provedor, candidato a partir do maior código conhecido do índice importado, verificação remota por referência antes de confirmar, retry limitado, TTL de expiração e rotina agendada de liberação. A reserva só é confirmada quando a publicação naquele site é confirmada. Edição de imóvel existente nunca pede código novo e preserva o `external_property_id`. Falha em um site não bloqueia o outro.

## 3. Link público ao lado do código

Ação compacta com ícone de link e tooltip por site ("Copiar link da Cordial" / "Copiar link da Morar"), na ficha e na revisão, com confirmação temporária "Link copiado" e opção "Abrir no site" no menu. Sem link válido, mostra "Link disponível após publicação" — nunca um link montado a partir do código.

Backend: após criar/alterar, o worker consulta o imóvel remoto, extrai a URL pública canônica, valida o host contra a allowlist dos dois domínios e o ID/código, e grava em `external_public_url` com `last_verified_at`. URLs ausentes entram em reconciliação em lotes, sem bloquear nada.

## 4. Fotos na etapa 6

A etapa 6 passa a ser "Fotos, publicação e revisão". Upload por arrastar/soltar ou seleção múltipla (JPEG, PNG, WebP), preview imediato, progresso por arquivo, reordenação por arrastar e por botões acessíveis, definir capa, remover, substituir e repetir envio em falha; duplicatas detectadas por checksum.

Os arquivos vão para o Storage privado assim que escolhidos (não no clique final) e ficam registrados no banco; a publicação consome imagens já persistidas. Sempre exatamente uma capa; removendo a capa, a primeira foto assume.

Sincronização: o worker envia só o que mudou (diff por checksum), mantém ordem e capa, não reenvia foto já confirmada, remove externamente apenas o que foi removido de propósito e nunca apaga do Storage antes da confirmação. Falha na Cordial não impede a Morar.

Fechamento da etapa 6: resumo separado por site (código reservado, dados válidos, N fotos prontas, status da publicação, link após confirmação), ação principal "Cadastrar e publicar", secundária "Salvar rascunho", com bloqueio de envio duplicado.

## Detalhes técnicos

**Migrations (pequenas e reversíveis)**
1. `provider_code_reservations` (provider, code, property_id, reservation_token, status, reserved_by, reserved_at, expires_at, committed_at) + unique (provider, code) + GRANTs + RLS (leitura/escrita só autenticado; escrita real via função) + função `reserve_provider_code(provider)` com `pg_advisory_xact_lock` e `release_expired_provider_codes()` agendada.
2. `property_images`: colunas faltantes (`width`, `height`, `upload_status`, `alt_text`), índice único parcial garantindo uma capa por imóvel, e RLS restrita por papel (hoje as políticas são `true` para todo autenticado).
3. `property_image_provider_publications`: estado `delete_pending` e `last_synced_at` já coberto por `synced_at`; adicionar índice por publicação/status.
4. Índices de filtro em `properties` (operacao, cidade, tipo, valor, dormitorios, area_principal, codigo) e `pg_trgm` para a busca textual.
5. Backfill: nenhum código novo para imóveis importados; reconciliação de URLs enfileirada em lotes.

**Backend**
- `listImoveis` reescrito para aceitar todos os filtros, ordenação e o predicado real de provedor via join/`in` sobre `property_provider_publications` (sem carregar o catálogo inteiro); mesmas condições usadas nas contagens.
- Novas server functions em `src/lib/imoveis/`: reserva/liberação de código, comandos de mídia (registrar upload, capa, ordem, remoção) e resolução de URL canônica dentro do worker/reconciliador existentes (`sync.server.ts`, `reconcile.server.ts`) — sem integração paralela.
- Nenhum token no cliente; toda chamada ImobiBrasil continua server-side.

**Frontend**
- `usePropertiesSearch`, `usePropertyCodeReservation`, `usePropertyMedia` e utilitário de cópia de link, todos sobre os hooks já existentes em `src/hooks/useImoveis.ts` / `usePropertySync.ts`.
- Componentes novos: barra de filtros + painel avançado, uploader/galeria ordenável na etapa 6, botão de copiar link.

**Validação**
Testes unitários dos normalizadores de filtro, do diff de fotos e da reserva de código; verificação de concorrência de código no banco; ciclo real Cordial, Morar e ambos com conferência de ID, código, fotos e URL canônica após publicação; lint, typecheck e build.

## Limitações confirmadas
A API não expõe consulta de "próximo código livre"; a disponibilidade é inferida por consulta de referência mais reconciliação do índice importado, com revalidação imediatamente antes de publicar e recuperação automática em caso de colisão.
