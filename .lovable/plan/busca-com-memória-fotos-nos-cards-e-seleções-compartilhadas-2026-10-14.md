# Busca com memória, fotos nos cards e Seleções compartilhadas

## 1. Entendimento
O corretor filtra em `/imoveis`, mas para ver mais fotos precisa abrir a ficha e, ao voltar, perde a pesquisa. Vamos: (a) manter a pesquisa e a posição ao ir e voltar; (b) trocar e ampliar fotos dentro do card; (c) deixar o corretor montar uma seleção ao longo de várias pesquisas e gerar um link público para o cliente ver no celular, marcar o que gostou e chamar o corretor no WhatsApp.

## 2. Diagnóstico (lido no código)
- Busca: `src/routes/_app.imoveis.index.tsx`. Os filtros já ficam no endereço da página (`validateSearch` + `parseCatalogSearch`/`serializeCatalogSearch` em `src/lib/imoveis/filters.ts`), aplicados com `replace: true`. Paginação numerada (`CatalogPagination`, 24 por página), sem carregamento progressivo.
- Dados: `useImoveisList` (`src/hooks/useImoveis.ts`), chave `["imoveis", filtros]`, `staleTime` 60 s, `placeholderData` = anterior. Roteador com `scrollRestoration: true` (`src/router.tsx`).
- Card: `src/components/imoveis/PropertyCatalogCard.tsx`. Mostra só `coverUrl`; um `<Link>` invisível cobre o card inteiro (`absolute inset-0 z-[1]`), com ações em `z-10` (links públicos e editar). Selos C/M e códigos por site vêm de `property.publications`; cada card é **um único cadastro** com até duas publicações (Cordial e Morar), não registros duplicados — nada de deduplicar por endereço/preço/foto.
- Fotos: tabela `property_images` (ordem/capa ativas conforme `src/lib/imoveis/active-order.ts`), lidas por `usePropertyMedia`.
- Favoritos existentes: só nos sites públicos (`src/lib/cordial-site/favorites.ts`, por marca); não há favoritos internos nem seleção/compartilhamento no Gestão.

### Causa da perda dos filtros (com evidência)
Não é desmontagem nem estado em memória: o estado está na URL. A perda vem de **navegação que descarta os parâmetros**:
- `src/routes/_app.imoveis.$imovelId.index.tsx:198` — o botão de voltar da ficha usa `to="/imoveis"` sem `search`.
- `src/components/imoveis/CatalogHeaderControls.tsx:18` — o controle do cabeçalho navega para `/imoveis` montando a busca do zero.
- `DeletePropertyDialog.tsx:49` também volta sem pesquisa (aceitável após excluir, mas vamos preservar).
O botão Voltar do navegador já deveria funcionar; a posição de rolagem depende do `scrollRestoration`, que hoje corre antes da lista chegar quando o cache expira (60 s). Isso será confirmado com teste no navegador na etapa 1 antes de corrigir.

## 3. Mapa dos pontos afetados
```text
Busca        _app.imoveis.index.tsx, filters.ts, CatalogHeaderControls.tsx
Ficha        _app.imoveis.$imovelId.index.tsx (voltar), DeletePropertyDialog.tsx
Card         PropertyCatalogCard.tsx  (+ novo CardGallery, PhotoLightbox)
Seleção      novo src/lib/selecoes/*, novo SelectionBar, SelectionReviewSheet
Gestão       nova rota _app.selecoes.tsx + item no menu (sidebar-menu.tsx)
Público      nova rota publica /s/$token (noindex)
Banco        migração aditiva: shared_selections, shared_selection_items, RPC pública
```
Fora de escopo e intocado: NFS-e, sync Imobi/fotos, endereço, códigos, sites Cordial/Morar.

## 4. Etapas

**Etapa 1 — Memória da busca**
- Voltar da ficha: usar `history.back()` quando a página anterior for a busca; senão, link para `/imoveis` com a última pesquisa guardada na sessão (`sessionStorage`, chave por usuário).
- `CatalogHeaderControls` passa a herdar a pesquisa atual (`search: prev => ...`).
- Rolagem: guardar o id do imóvel clicado; ao voltar, após a lista carregar, rolar até esse card (âncora), com fallback para o topo se ele não estiver mais na página.
- "Limpar filtros" só mexe nos filtros. Nova pesquisa explícita nunca é sobrescrita pelo que estava guardado.

**Etapa 2 — Galeria no card**
- Nova função de servidor leve `listImoveisPhotos(ids)` que traz só as URLs em tamanho de card (ordem ativa) dos imóveis da página atual, em uma consulta só; a lista principal fica igual.
- `CardGallery`: setas no desktop, deslizar no celular (só gesto horizontal; vertical continua rolando), contador "3/12", sem autoplay, índice local por card (`key = property.id`), proporção fixa, pré-carrega só a próxima foto. Uma foto = sem setas; sem foto/erro = estado alternativo atual.
- Setas, ampliar e selecionar ficam acima do link invisível e param a propagação; o resto do card continua abrindo a ficha.
- `PhotoLightbox` (Dialog existente): abre por cima dos resultados, teclado (setas/Esc), devolve o foco ao card.

**Etapa 3 — Seleção durante a busca**
- Botão "Selecionar" no card (ícone + texto, estado com check e borda — não só cor), posicionado fora das setas e dos selos.
- Rascunho guardado no navegador com **apenas ids**, chave `usuário + imobiliária`; apagado no logout. Mostra qual seleção está ativa (rascunho novo ou edição de uma existente); "Nova seleção" é ação explícita.
- Barra fixa compacta: contador (inclui itens fora do filtro), "Revisar seleção", "Criar link", "Limpar seleção" (com confirmação). No celular respeita a área segura e a lista ganha espaço no fim.
- Painel de revisão: lista com foto, preço atual e disponibilidade (buscados pelos ids), remover, reordenar por arrastar e por botões subir/descer.

**Etapa 4 — Banco e link público**
- Migração aditiva:
  - `shared_selections`: id, agency (cordial/morar), owner_id, corretor_id, title, public_message, internal_client_name, token (único, 32 bytes aleatórios em base64url), expires_at, status (ativa/encerrada), created_at, updated_at, revision.
  - `shared_selection_items`: selection_id, property_id, position, único (selection_id, property_id).
  - RLS no padrão do projeto: dono, admin e secretária da mesma imobiliária (`user_agencies`/`has_role`); sem acesso anônimo às tabelas.
  - Função única `selection_property_is_public(property)` = mesma regra de "publicável" já usada nos sites (não arquivado, disponível, finalidade compatível, divulgação autorizada). Reutilizada ao criar, editar e na consulta pública.
  - RPC `create_or_update_selection(...)` atômica com chave de idempotência (evita duplicar em clique repetido); recusa itens inelegíveis listando quais.
  - RPC pública `get_shared_selection(token)` (SECURITY DEFINER, retorno com lista fechada de campos): marca, título, mensagem, nome e WhatsApp do corretor, e por item ativo: referência pública, finalidade, preço venda/aluguel, condomínio/IPTU só se preenchidos, bairro/cidade (respeitando endereço oculto), dorm/banh/vagas/área, fotos públicas. Itens inelegíveis viram só "opção indisponível". Token inválido, expirado ou encerrado devolve só o estado, sem metadados.
- Validade padrão: 30 dias (editável: 7, 15, 30, 60 ou sem validade). Mensagem ao criar: "Quem tiver o link consegue ver a seleção."
- Concluir: Copiar link, Compartilhar no WhatsApp (texto editável, abre o WhatsApp — nada é enviado automaticamente), Pré-visualizar.

**Etapa 5 — Página do cliente `/s/$token`**
- Pública, sem login, mobile-first, `noindex`, prévia genérica com marca e título. Sem cache público.
- Cabeçalho com marca, título, mensagem, corretor e contagem atual. Cards com galeria (mesmo `CardGallery`), detalhe em painel dentro da página, voltando à mesma posição.
- "Gostei deste imóvel": salvo só no navegador (chave seleção+imóvel). "Conversar sobre os escolhidos": WhatsApp do corretor com referências dos favoritos (ou da seleção toda) e o link; lista longa é resumida. Texto: "Abrimos o WhatsApp para você revisar e enviar."
- Estados: todas indisponíveis, expirado, encerrado, inválido.

**Etapa 6 — Seleções compartilhadas (gestão)**
- Rota `/selecoes` no grupo de Imóveis do menu. Lista: título, cliente interno, responsável, data, nº de imóveis, situação.
- Ações: ver, editar (mesmo link; salva tudo de uma vez via RPC, visitante nunca vê meia alteração), copiar, pré-visualizar, duplicar (novo token), encerrar.

**Etapa 7 — Validação**
- Testes puros (Vitest, no script `test`): rascunho sem duplicatas, título sugerido, montagem do texto do WhatsApp, regra de elegibilidade.
- Testes no navegador com dados de teste: os 9 cenários pedidos (busca e retorno, fotos sem abrir ficha, seleção entre pesquisas e recarga, criar/editar/duplicar/encerrar, página pública sem login com só campos autorizados, imóvel retirado, links inválidos/expirados, WhatsApp sem envio, celular e desktop). Sem mensagens a clientes reais. O que não puder ser testado será informado.

## Detalhes técnicos
- Sem novas bibliotecas: gestos com Pointer Events; reordenação com o dnd já usado em `PhotoSortableGrid`; Dialog/Sheet do shadcn existente.
- Rascunho em `localStorage` (ids apenas) com chave `cordial:selecao:<userId>:<agency>`, limpo em `SIGNED_OUT`.
- Fotos públicas: só URLs já publicadas/derivadas; retirar o imóvel tira a foto da resposta, mas não revoga URLs de mídia já públicas (será explicado na entrega).
- Pendências para o Leonardo confirmar: validade padrão de 30 dias; se corretores podem ver seleções de outros corretores da mesma imobiliária (proposta: só admin/secretária); WhatsApp do corretor vem do perfil — quem não tiver telefone cadastrado cai no contato da imobiliária.
