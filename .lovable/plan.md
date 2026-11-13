# Imóveis: desativados e arquivados na lista normal, com etiqueta forte

## O que foi conferido
- No banco há hoje **62 arquivados** e **1 desativado** pela regra proposta.
- A regra de `shared_selection_property_eligible` é exatamente a descrita no pedido, e a view `properties_catalog` já expõe as colunas `exibir_imovel`, `disponibilidade` e `is_draft`.
- O mapeamento da lista (`mapRow`) **ainda não traz** `exibirImovel` nem `disponibilidade`. Esses campos só vêm na ficha.
- Usam `listImoveis` sem mandar `arquivados`: `AgendaFormModal`, `MetaAdsCard` e `_app.imoveis-destaque.tsx`, este último pelo `useImoveisList`.

## Decisões
- **Definição de desativado:** não arquivado, não rascunho e com `exibir_imovel = false` ou `disponibilidade` fora de vazio, "sim", "disponível" e "disponivel" (sem espaços nas pontas e em minúsculas). É a mesma regra do banco. Não achei sinal melhor: o "Inativo" do ImobiBrasil já vira `exibir_imovel = false`. O rascunho continua só com "Cadastro não concluído", e Arquivado vence Desativado.
- **Ordenação com paginação:** a consulta da lista não permite ordenar por uma expressão calculada, e fazer duas consultas quebraria a contagem e as páginas. Por isso proponho **uma migration aditiva mínima**: recriar a view `properties_catalog` com uma coluna nova no fim, `situacao_rank` (0 disponível ou rascunho, 1 desativado, 2 arquivado). A view continua com `security_invoker = true`, as mesmas colunas na mesma ordem e as mesmas permissões, sem mexer em dados nem em RLS. O catálogo ordena por `situacao_rank` e depois pela ordenação escolhida, e a paginação no servidor continua igual.
  ```sql
  -- recriada a partir da definição atual (lida antes de aplicar), acrescentando no fim:
  , CASE
      WHEN p.archived_at IS NOT NULL THEN 2
      WHEN coalesce(p.is_draft,false) THEN 0
      WHEN NOT public.shared_selection_property_eligible(p) THEN 1
      ELSE 0
    END AS situacao_rank
  -- WITH (security_invoker = true); GRANTs reaplicados iguais aos atuais
  ```
- **Filtro `situacao`:** `todos` (padrão do catálogo), `disponiveis`, `desativados` e `arquivados`. Os filtros correspondem a `situacao_rank` igual a 0, 1 ou 2.
- **Compatibilidade de quem já usa a lista:** sem `situacao`, a função continua escondendo os arquivados, como hoje. Agenda e Meta Ads passam a mandar `situacao: "disponiveis"`, e assim deixam de oferecer desativados. Proponho o mesmo para os **destaques**, porque um imóvel desativado não deve virar destaque.
- **Endereços antigos:**
  - `?arquivados=somente` passa a abrir `situacao=arquivados`.
  - `?arquivados=ocultar` passa a abrir `situacao=disponiveis`, porque é o que a pessoa via com aquele link.
  - Sem parâmetro, vale `todos`.
  - O endereço salvo para voltar da ficha passa pela mesma regra.
- **Cores**, sempre com ícone e texto, nunca só cor:
  - **Arquivado:** vermelho-vinho escuro (`#7f1d1d`) com texto branco (contraste perto de 10:1) e ícone `Archive`.
  - **Desativado:** âmbar forte (`#b45309`) com texto branco (contraste de cerca de 5:1, nível AA) e ícone `EyeOff`.
  - Escolhi vinho e âmbar queimado para não confundir com o azul da Cordial nem com o laranja da Morar, que é mais claro e puxado para o pêssego.
  - As duas cores entram como variáveis do tema, não fixas no componente.
- **Visual:**
  - Faixa larga no topo da foto, em caixa alta e com ícone ("ARQUIVADO" / "DESATIVADO").
  - Selo igual logo acima do nome.
  - Foto em tons de cinza e levemente apagada; card com borda tracejada na cor da situação e fundo um pouco atenuado; título e preço continuam bem legíveis.
  - No modo lista e no celular, o selo fica ao lado do nome, sempre visível (não depende dos selos de código, que somem em alguns tamanhos).
  - O selo "Arquivado" que entrou com a busca por código sai de dentro dos selos de código.
- **Separador entre grupos:** vale a pena. Quando a situação é "Todos" e aparece o primeiro imóvel com rank maior que 0 na página, entra uma linha discreta "Desativados e arquivados". Custa pouco e evita confusão no fim da lista.
- **Chip "Situação":** substitui "Catálogo ativo/Arquivados", com as opções Todos, Disponíveis, Desativados e Arquivados. A opção "Arquivados" substitui o atalho da lista antiga, então não precisa de outro. Também entra no painel de filtros. **Contagem por opção:** fica de fora por ora; sairia barato no banco, mas exigiria mais uma chamada ao servidor. Fica como possível próximo passo.
- **"Selecionar":** em desativados e arquivados o botão aparece desligado, com o texto "Indisponível para envio" e uma dica ao passar o mouse.
- **Busca por código:** continua ignorando os outros filtros, inclusive `situacao`, e passa a mostrar a etiqueta nova.

## Ajustes pequenos da busca por código
- O "Limpar" do painel de filtros passa a manter o código, junto com `q` e a marca.
- O aviso "Digite apenas números" não aparece quando o campo só tem `#` ou espaços.

## Arquivos
- `src/lib/imoveis/situacao.ts` (novo):
  - `normalizeDisponibilidade`;
  - `propertySituacao` → disponivel, desativado ou arquivado (o rascunho conta como disponível no grupo, mas mantém sua etiqueta);
  - `situacaoRank`.
- `src/lib/imoveis/situacao.test.ts` (novo).
- `src/types/property.ts`: `Property` ganha `exibirImovel`, `disponibilidade` e `situacao` na lista.
- `src/lib/imoveis/imoveis.functions.ts`:
  - `mapRow` passa a trazer os campos novos e a `situacao`;
  - novo input `situacao`;
  - filtro e ordenação por `situacao_rank`;
  - sem `situacao`, mantém o comportamento antigo.
- `src/lib/imoveis/filters.ts`:
  - `situacao` entra no lugar de `arquivados`, com leitura de compatibilidade;
  - opções do filtro;
  - `toListInput`, contagem, etiquetas.
- `src/components/imoveis/PropertyFilterBar.tsx`: chip "Situação" e o ajuste do `#`.
- `src/components/imoveis/catalog/PropertyFiltersPanel.tsx`: opções de situação e o "Limpar" que mantém o código.
- `src/components/imoveis/PropertyCatalogCard.tsx`: faixa, selo, foto cinza, botão "Selecionar" desligado e remoção do selo antigo.
- `src/routes/_app.imoveis.index.tsx`: resumo do topo e separador entre grupos.
- `src/styles.css`: variáveis de cor das duas situações.
- `AgendaFormModal.tsx`, `MetaAdsCard.tsx` e `_app.imoveis-destaque.tsx`: passam `situacao: "disponiveis"`.
- `package.json`: novo teste no script `test`.
- Migration `catalog_situacao_rank` (só a view, como acima).
- `AGENTS.md`: uma regra dizendo que a situação do imóvel segue `shared_selection_property_eligible` e é exposta como `situacao_rank`.

## Fora do escopo
Publicação nos sites, ImobiBrasil, arquivamento, RLS, dados, CORDIAL bot e busca do topo ficam como estão. Nada será publicado.

## Testes
- **Situação:**
  - imóvel disponível;
  - desativado por `exibir_imovel = false`;
  - desativado por disponibilidade "não" ou "vendido";
  - "Disponível " com espaço conta como disponível;
  - arquivado vence desativado;
  - rascunho;
  - ordem dos grupos.
- **Filtros:** ida e volta de `situacao` pela URL, `arquivados=somente` e `arquivados=ocultar`, `toListInput` e contagem.
- **Código:** testes atuais da busca por código passando, mais o caso do `#`.
- Typecheck e lint.

## Validação na prévia
Logado, no computador (1366) e no celular (390), em cartões e lista:
- Em "Todos", os arquivados aparecem no fim com a faixa e o separador.
- O filtro "Arquivados" mostra os 62.
- O desativado aparece com a etiqueta âmbar.
- "Selecionar" fica desligado nos dois casos.
- Os endereços antigos continuam funcionando.
- Agenda e Meta Ads não oferecem imóveis inativos.

## Riscos
- Recriar a view exige copiar exatamente a definição atual. Vou ler a definição antes e conferir depois que colunas, permissões e `security_invoker` ficaram iguais.
- Como o banco é compartilhado com o site no ar, a coluna nova é só um acréscimo e a versão publicada atual não é afetada.
- Mudar o padrão para "Todos" faz o total do topo subir (cerca de 62 a mais). É o comportamento pedido.
