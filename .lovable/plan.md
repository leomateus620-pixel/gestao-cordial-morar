# Ficha do imóvel: separar o que vai para o site do que é interno

## O que verifiquei agora

- A ficha (`/imoveis/{id}`) já carrega os campos internos (proprietário, telefone, e-mail, quem agenciou, informações internas), mas eles ficam dentro de um bloco "Contato interno" **fechado por padrão** e que **desaparece por completo quando todos estão vazios**. Na prática, o usuário abre o imóvel e só vê dados de site.
- Na base atual (809 imóveis) esses campos estão quase todos vazios: 1 imóvel com nome de proprietário, 1 com telefone, 0 com e-mail, 0 com "quem agenciou", 2 com informações internas. Ou seja, na maioria dos imóveis o bloco simplesmente não existe — foi isso que você viu.
- A coluna `outras_informacoes` existe no banco e é tratada como interna no envio aos sites, mas **não está mapeada** na ficha nem no formulário — hoje é um campo invisível no sistema.
- O envio aos sites já está correto: o serializador exclui explicitamente `observacao_imovel` e `outras_informacoes`, e há teste cobrindo isso. Nenhum campo interno vaza para Cordial/Morar.

## O que vou fazer

### 1. Ficha dividida em duas áreas explícitas

- **Área "Publicado nos sites"**: descrição, pontos fortes, localização, características/áreas, valores, empreendimento — com um selo discreto indicando que esse conteúdo vai para Cordial/Morar.
- **Área "Uso interno — não vai para o site"**: bloco visualmente distinto (borda/fundo próprios + selo "Interno"), contendo proprietário, telefone, e-mail, quem agenciou, origem da captação, exclusividade/autorização/escriturada/averbada/placa, informações internas e outras informações.
- Esse bloco passa a **aparecer sempre**, aberto por padrão, e quando um campo estiver vazio mostra "Não informado" com um atalho "Completar no cadastro" que leva à etapa certa da edição. Assim o corretor enxerga o que falta em vez de não ver nada.

### 2. Trazer `outras_informacoes` para o sistema

Mapear o campo no tipo `PropertyDetail`, na leitura e na gravação, exibi-lo no bloco interno da ficha e adicioná-lo ao formulário junto de "Informações internas", com o mesmo aviso de uso interno.

### 3. Reforçar a marcação no formulário de edição

As etapas do cadastro que contêm campos internos ganham o mesmo selo "Não vai para o site", para o corretor entender a diferença já no momento de preencher.

### 4. Validação

- Rodar os testes do serializador para garantir que nenhum campo interno passou a ser publicado.
- Abrir no preview um imóvel com dados internos preenchidos e um sem, como admin e como corretor, conferindo leitura e edição.

## Detalhes técnicos

- `src/routes/_app.imoveis.$imovelId.index.tsx`: reorganizar as seções em dois agrupamentos, substituir o `<details>` "Contato interno" por um painel interno sempre visível, com `Field` tolerante a vazio.
- `src/types/property.ts`, `src/lib/imoveis/imoveis.functions.ts` (`WRITE_COLUMNS`, `mapDetail`): incluir `outrasInformacoes` → `outras_informacoes`.
- `src/components/imoveis/PropertyForm.tsx`: novo campo e selos de "interno".
- Sem mudanças em fila, worker, cliente HTTP, schema do banco ou publicação.
