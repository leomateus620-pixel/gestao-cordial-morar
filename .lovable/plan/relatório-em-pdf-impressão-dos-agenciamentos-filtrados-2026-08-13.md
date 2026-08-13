# Relatório em PDF / impressão dos agenciamentos filtrados

Adicionar um botão de **Imprimir / PDF** ao lado do botão "Filtros", no menu Agenciamentos, que gera um relatório dos imóveis captados exatamente conforme o filtro aplicado (corretor + período + demais filtros ativos).

## Comportamento

- O botão aparece **somente para admin** e **somente quando um corretor específico está selecionado** no filtro (não em "Todos"). Fica ao lado do botão "Filtros", com o mesmo estilo dos controles atuais.
- Ao clicar, abre a caixa de impressão do navegador, já com o layout do relatório pronto. O usuário pode imprimir em papel ou escolher "Salvar como PDF".
- Se nenhum registro estiver na lista filtrada, o botão fica desabilitado.

## Conteúdo do relatório

Reproduz os mesmos dados e a mesma leitura visual da tela, sem inventar campos novos:

- Cabeçalho: título "Relação de imóveis captados", nome do corretor filtrado, período selecionado (Este mês / Últimos 30 dias / Trimestre / Ano / Todo período), trilha (Venda ou Aluguel), demais filtros ativos, data/hora de geração e total de registros.
- Um bloco por agenciamento, na mesma ordem exibida na tela, com: status, imobiliária, finalidade, códigos Morar e Cordial, tipo + endereço, bairro/cidade, proprietário e telefone, corretor responsável e data do agenciamento, e o checklist operacional com o mesmo percentual e os itens pendentes listados.
- Rodapé com numeração de páginas e identificação do sistema.

## Detalhes técnicos

- Novo componente `src/components/agenciamentos/AgenciamentoPrintReport.tsx`: renderiza a lista filtrada em layout A4 (retrato), oculto na tela (`hidden print:block`) e visível apenas na impressão.
- Novo botão em `src/routes/_app.agenciamentos.tsx`, ao lado de `<AgenciamentoFilters />`, condicionado a `isAdmin && filters.corretorId !== "todos" && agenciamentos.length > 0`, chamando `window.print()`.
- Regras de impressão em `src/styles.css` dentro de `@media print`: esconder shell/sidebar/FAB/cards de resumo, remover fundos e sombras, forçar cores legíveis, `@page { size: A4; margin: 12mm }` e evitar quebra de página no meio de um registro (`break-inside: avoid`).
- Nenhuma alteração de banco, de permissões ou de lógica de filtro — o relatório consome o array `agenciamentos` já filtrado pela tela.

## Validação

- Conferir com um corretor filtrado que a contagem impressa bate com "N registros encontrados".
- Conferir a troca de período (mês / 30 dias / trimestre / ano) refletindo no cabeçalho e na lista.
- Conferir que o botão não aparece para corretor/secretária nem com "Todos os corretores".
- Inspecionar o resultado impresso em várias páginas para garantir que nenhum card fique cortado.
