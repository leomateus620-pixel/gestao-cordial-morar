# Plano — demandas do grupo (Gestão Cordial / Morar)

Auditoria feita no código atual. Vários itens da lista **já estão implementados** — marco abaixo para não refazer trabalho. O restante vai em fatias pequenas, uma aprovação por fatia.

## Já existe hoje (não refazer)

- Telefone e e-mail do proprietário: já estão no tipo do imóvel e no passo Identificação do cadastro (`PropertyForm.tsx`, com máscara de telefone e validação de e-mail).
- Cidade pré-preenchida com Santa Rosa e editável (`CIDADE_PADRAO` no `PropertyForm.tsx`).
- Etapas Agenciamento e Drive no fluxo de cadastro (`PropertyAgencyStep.tsx`, `PropertyDriveStep.tsx`, anexadas como etapas extras do wizard).
- Drive com pastas Horizontal / Vertical / Vídeos, upload separado de vídeo e reclassificação de foto (`src/lib/imoveis/drive/*`, `PropertyDriveStep.tsx`).
- Filtro de valor mínimo/máximo na lista com presets rápidos + digitação manual (`PropertyFilterBar.tsx`).
- Impressão/PDF da relação filtrada de Agenciamentos, por corretor e período (`AgenciamentoPrintReport.tsx`, botão Imprimir na rota de Agenciamentos).
- Marca combinada Cordial+Morar no canto inferior direito em todas as fotos (`watermark-config.ts`, `computePlacement`).
- Seleção de imóvel ao criar atendimento — existe, mas hoje é um `select` simples com a lista carregada (ver fatia 5).

## Fatias propostas (nesta ordem)

### Fatia 1 — Busca geral de verdade (prioridade máxima, pedido repetido)
Hoje: `/busca` existe e cobre atendimentos, clientes, vendas, agenciamentos, inquilinos, contratos e `rental_properties`. **Não cobre o catálogo `properties`** (os ~790 imóveis publicados) nem busca por nome/telefone do proprietário. Além disso, na rota `/imoveis` a barra do header virou busca do catálogo e não leva mais ao resultado global.

Entrega:
- Incluir `properties` na busca (código Cordial/Morar, endereço, bairro, título, nome/telefone/e-mail do proprietário) e uma nova categoria "Proprietário" apontando para a ficha do imóvel.
- Timeline do resultado de imóvel: agenciamento vinculado, atendimentos que citam o imóvel, contratos e visitas ligadas.
- No header em `/imoveis`: a busca continua filtrando o catálogo enquanto digita, mas Enter (e um atalho "Buscar em todo o sistema") leva a `/busca?q=…`.
- Risco: nenhum de schema. Custo de query — usar índices trigram já existentes e limitar por categoria.

### Fatia 2 — Ficha do imóvel: link interno, Maps interno e informações internas
- Botão **Copiar link** ao lado de Editar, copiando a URL da ficha no Gestão (`/imoveis/:id`). Hoje só existe o copiar link público dos sites.
- Bloco **Uso interno** (fechado por padrão): mapa/link do Google Maps gerado a partir do endereço, observações internas e "quem agenciou". Nada disso entra no payload ImobiBrasil.
- Risco: precisa de migração pequena se guardarmos `observacoes_internas` (verificar se já cabe em coluna existente antes de criar). Garantir no `serializers.ts` que os campos internos não são enviados.

### Fatia 3 — Imóveis importados da API: descrição e campos internos
- Reprocessar a descrição dos imóveis importados (hoje `decodeHtml` de texto vindo com HTML/entidades, resultando em texto quebrado): normalizar `<br>`, parágrafos e entidades para texto limpo no Gestão, sem alterar o que já vai fiel para os sites.
- Preencher/permitir editar nos importados: informações internas, corretor que agenciou, dados e contato do proprietário (campos já existem; falta expô-los na edição dos registros vindos de importação).
- Risco: alterar descrição em massa reenfileira sync. Fazer em lote controlado, com pré-visualização de amostra antes de aplicar.

### Fatia 4 — Marca d'água mais leve
- Reduzir a intensidade da marca (opacidade ~0,7) mantendo posição e as duas logos. Exige bump de `WATERMARK_VERSION` (a versão é chave de idempotência) e reprocesso apenas de fotos novas; fotos antigas ficam como estão salvo pedido explícito.
- Risco: reprocesso em massa é caro; por padrão não reprocessar histórico.

### Fatia 5 — Atendimento: escolher imóvel por busca
- Trocar o `select` de imóveis por um campo de busca (código, bairro, endereço) com resultados sob demanda, em vez de carregar a lista inteira.
- Risco: baixo, só UI + uma função de busca reduzida.

### Fatia 6 — Funil: Fechamento → Venda
- No card em Fechamento, ação **Concluir venda**: cria o registro em Vendas já com cliente, imóvel, corretor e valor; permite anexar contratos; marca o atendimento como convertido e o remove do funil (passa a aparecer na aba de Venda).
- Risco: maior do lote — envolve `real_estate_sales`, `sale_documents`, permissões e histórico do atendimento. Precisa ser idempotente (não criar venda duplicada em duplo clique) e reversível por admin.

## Observações técnicas
- Nada aqui muda fila, worker ou cliente HTTP do ImobiBrasil.
- Campos internos (contato do proprietário, Maps interno, observações internas, Drive vertical/vídeo) nunca entram no payload dos sites — validado no serializer com teste.
- UI enxuta: sem textos explicativos longos, blocos internos colapsados por padrão.
