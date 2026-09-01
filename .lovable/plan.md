# Demandas de 01/09/2026 — 4 itens

Escopo restrito aos 4 pedidos de hoje. Nada de PDF de agenciamentos, filtro de valor, Santa Rosa, copiar link, Maps, watermark, origem do lead, metragem ou API.

---

## 1. Cadastros importados: descrição, informações internas, quem agenciou, contato do proprietário

**Hoje**
- A importação preenche `descricao_imovel`, `observacao_imovel` e `pontos_fortes` passando por `decodeHtml` (`src/lib/imobibrasil/import-normalizers.ts`), que remove tags e entidades. O texto chega achatado — perde parágrafos e listas do site de origem, e é isso que aparece "estranho" na ficha.
- A importação nunca preenche `corretor_id`, `corretor_nome`, `outras_informacoes` nem `proprietario_nome/telefone/email` (o `sanitizeRemotePayload` remove dados pessoais de propósito).
- Contato do proprietário já existe no formulário e na ficha ("Contato interno"), então em imóveis importados ele fica apenas vazio.
- `observacao_imovel`, `outras_informacoes`, `corretor_id` e `corretor_nome` existem no banco mas **não existem** em `src/types/property.ts`, nem em `WRITE_COLUMNS` (`src/lib/imoveis/imoveis.functions.ts`), nem no formulário, nem na ficha.
- Risco atual: `src/lib/imobibrasil/serializers.ts` **envia** `observacaoImovel` e `outrasInformacoesImovel` para Cordial/Morar. Se virarem campo interno, precisam sair do payload.

**Falta**
- Normalização de descrição importada que preserve quebras de parágrafo.
- Campo "Informações internas" e campo "Quem agenciou" (corretor responsável) editáveis no cadastro e visíveis na ficha.
- Bloco de preenchimento do contato do proprietário destacado em imóveis importados (o campo existe, só está vazio).

**Fatias**
1. Auditar 3 imóveis importados reais no banco e comparar `descricao_imovel` com o texto do site; ajustar `decodeHtml` para manter parágrafos/quebras.
2. Adicionar `observacaoImovel` (informações internas) e `corretorId`/`corretorNome` ao tipo, ao mapeamento de escrita e ao formulário (etapa de identificação), com exibição na ficha em bloco interno.
3. Remover `observacaoImovel` e `outrasInformacoesImovel` do payload dos sites; teste em `serializers.test.ts` garantindo que campo interno não vaza.

**Risco:** mexer no serializer afeta a publicação — coberto por teste antes de sincronizar qualquer imóvel real.

---

## 2. Drive: Horizontal automático, Vertical e Vídeos com upload separado

**Hoje**
- Horizontal e Vertical saem **das mesmas fotos da Etapa 6** (`property_images`): a categoria é calculada por dimensão, com um seletor manual horizontal/vertical em `PropertyDriveStep.tsx`. Ou seja, hoje toda foto vertical do Drive também vai para o site.
- Vídeos já têm caminho próprio (`property_videos` + bucket dedicado) e não vão ao site.
- `property_drive_files` liga cada arquivo à foto (`image_id`) ou ao vídeo (`video_id`); a pasta e as 3 subpastas já existem em `property_drive_folders`.

**Falta**
- Um canal de upload de fotos **exclusivas do Drive** (verticais), que nunca entram na galeria do site nem no sync ImobiBrasil.

**Fatias**
1. Migration: tabela `property_drive_photos` (espelho de `property_videos`) + bucket privado, com GRANTs e RLS no padrão do projeto. Nada muda em `property_images`.
2. Server functions de upload/remoção dessas fotos e inclusão delas na fila do Drive com categoria `vertical`.
3. UI da etapa Drive em três blocos claros: **Horizontal** (somente leitura, "vem das fotos do site"), **Vertical** (upload próprio) e **Vídeos** (como já é). O seletor horizontal/vertical das fotos do site vira apenas correção de orientação da pasta Horizontal.

**Risco:** duplicidade entre foto do site classificada como vertical e foto vertical enviada à parte — resolvido mantendo a pasta Vertical alimentada só pelo novo canal.

---

## 3. Busca geral no header

**Hoje**
- Existe busca global real (`/busca`, `runGlobalSearch`) cobrindo atendimentos, clientes, aluguéis, vendas, agenciamentos, imóveis de locação, inquilinos e — desde a última alteração — o catálogo de imóveis, incluindo nome/telefone/e-mail do proprietário.
- Porém, na rota `/imoveis`, o `app-shell` troca a busca global pela `CatalogSearchInput`, que só filtra o catálogo (`q` na URL). É esse o comportamento reclamado.
- Não há categoria de **visitas** (a tabela `agenda_events` já liga atendimento, cliente e imóvel).

**Falta**
- Header sempre com busca global, em qualquer tela, incluindo Imóveis.
- Filtro do catálogo permanecendo disponível, mas na barra de filtros da lista, não no header.
- Visitas/compromissos como resultado e como vínculo na linha do tempo.

**Fatias**
1. Header: usar sempre `GlobalSearchBar`; devolver o campo de busca do catálogo para a `PropertyFilterBar` (mantendo `q` na URL e as pills de carteira como estão).
2. Busca global: adicionar categoria "Visitas" a partir de `agenda_events` e incluir visitas nas linhas do tempo de cliente, atendimento e imóvel.
3. Conferir que buscar um nome ("Renato") retorna, num só resultado agrupado, cliente + proprietário + imóvel + atendimento + agenciamento + contrato + visitas.

**Risco:** permissão — a busca global hoje é restrita a admin; manter essa regra e simplesmente esconder o campo para quem não pode buscar.

---

## 4. Funil: Fechamento concluído vira Venda

**Hoje**
- O funil vai até a etapa "Fechamento" (`AtendimentoDetailDrawer`), com confirmação de encerramento; existe conversão para cliente, mas **nenhuma** ligação com o módulo Vendas.
- Vendas já tem criação, anexos de contrato e documentos (`src/lib/sales/sales.functions.ts`, `SaleForm`), mas nada aponta para o atendimento de origem.
- `attendances` não tem coluna de venda.

**Falta**
- Ação "Converter em venda" no card em Fechamento, criação da venda com dados pré-preenchidos, anexo de contrato e saída do card do funil.

**Fatias**
1. Migration: `attendances.venda_id` + marcação de convertido; `real_estate_sales.attendance_id` para rastrear a origem (com GRANTs/RLS).
2. Server function `converterAtendimentoEmVenda`: cria a venda a partir do atendimento (cliente como comprador, imóvel vinculado, corretor responsável, valor), grava os dois vínculos e move o atendimento para fora do funil.
3. UI: botão na etapa Fechamento abrindo um diálogo curto (valor, data, forma de pagamento, contrato opcional) reaproveitando o upload de contrato de Vendas; após confirmar, o card sai do quadro e a venda aparece em Vendas com link de volta ao atendimento.

**Risco:** conversão acidental e duplicada — botão só aparece em Fechamento, exige confirmação, e o vínculo impede converter duas vezes.

---

## Ordem sugerida

1 → 2 → 3 → 4, uma fatia por vez, com verificação a cada fatia. Nenhum imóvel novo é publicado nos sites durante os testes.
