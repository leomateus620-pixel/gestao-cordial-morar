# Secretária (Bianca) sem enxergar atendimentos e imóveis

## O que já foi conferido (somente leitura)

- **Permissões do banco estão corretas para ela.** Bianca tem papel secretária e acesso às carteiras Cordial e Morar. A regra de leitura de atendimentos libera tudo para secretária dentro dessas carteiras; imóveis e publicações são legíveis por qualquer usuário da equipe. Nada no banco está escondendo dados dela.
- **Os atendimentos da Graziela Thais Kunkel existem e estão visíveis para ela pelo banco:** dois registros, ambos Morar, finalidade compra (venda), tipo casa, com telefone:
  - um de 28/08, "em atendimento", com outro corretor;
  - um criado hoje às 17:12, "novo", enviado ao Felipe — provavelmente ela recriou porque não achou o primeiro.
- **O servidor entrega a lista completa para secretária** (sem limite de quantidade, sem filtro por dono).

Conclusão: o sumiço acontece **na tela**, por filtros que escondem registros sem deixar claro.

## Causas encontradas na tela de Atendimentos

1. **A busca só procura dentro da aba ativa (Vendas ou Aluguéis).** Quem está em Vendas e pesquisa um cliente de locação não encontra nada — é exatamente o caso do atendimento de locação dela.
2. **Seleção de imobiliária fica salva no aparelho.** Se em algum momento ela marcou "Cordial" no seletor do topo, todos os atendimentos da Morar (como os da Graziela) somem até ela voltar para "Todas", inclusive depois de fechar e abrir o sistema.
3. **Busca por telefone exige o formato exato.** Digitar só os números (ex.: 47999…) não encontra telefones salvos com parênteses e traço — atrapalha justamente quem quer achar o cliente para trocar o WhatsApp.
4. Filtros adicionais (status, período, corretor) também reduzem a lista sem aviso visível de quantos ficaram de fora.

## Causas prováveis em Imóveis

- A carteira escolhida (Cordial/Morar) e a busca do topo permanecem ao voltar da ficha e o botão "Limpar filtros" não as apaga — fácil achar que o imóvel sumiu.
- A busca de imóveis não procura pelo nome do proprietário; quem pesquisa pelo nome da pessoa não acha o imóvel.

## Correções

1. **Busca em todo o funil:** ao digitar um nome/telefone em Atendimentos, procurar nas duas abas e em todas as imobiliárias. Se houver resultados fora da aba ou imobiliária atual, mostrar um aviso "2 encontrados em Aluguéis / Morar — ver" que leva direto ao atendimento.
2. **Aviso de recorte ativo:** quando a imobiliária não for "Todas" ou houver filtros ligados, exibir faixa "Mostrando só Morar · X ocultos — mostrar todos", em Atendimentos e Imóveis.
3. **Telefone sem formato:** busca compara também só os dígitos.
4. **Imóveis:** "Limpar filtros" também zera carteira e busca; a busca passa a incluir o nome do proprietário (somente para a equipe, nada vai aos sites).
5. **Antes e depois:** reproduzir com a conta da Bianca (sessão de teste, sem senha, precisa da sua aprovação na hora) — buscar "Graziela" e o atendimento de locação — para confirmar a causa e validar a correção. Nenhum dado é alterado; o atendimento duplicado da Graziela fica como está (posso sinalizar para ela decidir qual manter).

## Fora do escopo

Permissões do banco (estão corretas), cadastro de imóveis, sync ImobiBrasil, NFS-e, fotos, códigos, endereços. Sem migração. Nada publicado sem seu ok.

## Detalhes técnicos

- `src/hooks/useAttendances.ts`: busca hoje é aplicada depois de `atendimentoMatchesAgency` e `matchesTrack`; adicionar `searchOutsideScope` (contagem/lista por trilha e agência) quando `query` não vazia.
- `src/services/atendimentos.ts` `atendimentoMatchesSearch`: incluir comparação por dígitos do telefone.
- `src/routes/_app.atendimentos.tsx`: aviso com link que troca `track`/`imobiliaria` e abre o `id`.
- Seletor global persistido em `gc.store.v2` (`src/store/app-store.ts`): manter, mas com faixa de aviso; opcional voltar a "Todas" no login.
- `src/routes/_app.imoveis.index.tsx` limpar filtros incluindo `carteira`/`q`; `src/lib/imoveis/imoveis.functions.ts` adicionar `proprietario_nome.ilike` ao `or` da busca.
- Testes: busca encontra fora da trilha; telefone por dígitos; agência "Todas" não filtra; limpar filtros zera carteira. Rodar `bun run test` e typecheck.
