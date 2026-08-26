# Bonificações: números corretos e transparentes para cada corretor

## O que verifiquei nos dados reais

Agenciamentos do Geandre em agosto/2026 (trilha Venda):

- 18 agenciamentos lançados no mês
- 10 com o checklist completo (fotos horizontal + vertical, cadastro Morar + Cordial) — só estes contam para bonificação
- 8 desses 10 têm placa instalada
- Regra: 8 captações + 4 placas por bonificação → 1 bonificação conquistada em agosto (já registrada e paga no sistema)

Ou seja, o "faltam 6 captações" está correto pela regra atual (falta chegar a 16/8 para a 2ª bonificação de agosto), mas a tela não explica isso: ela mostra "37 captações" no topo, "atual 10/8" no meio e não diz que 8 dos 18 agenciamentos do mês estão fora por checklist incompleto. Para o corretor parece erro de cálculo.

Conferi também o registro oficial de bonificações no banco e ele está batendo com os agenciamentos de todos os corretores (Geandre venda jul: 2 · ago: 1; Geandre aluguel acumulado: 2; Felipe venda jul: 1). Nenhuma bonificação faltando ou sobrando.

## Erro real encontrado

O progresso de bonificação é calculado a partir da lista **já filtrada** da tela (período, status, imobiliária, checklist). Consequências:

- ao filtrar por período/status, o percentual e o "faltam X" mudam sem motivo;
- na trilha Aluguel (regra acumulada, sem reinício mensal), qualquer filtro de período subestima o total acumulado.

O cálculo deve usar sempre a base completa do corretor, independente dos filtros de visualização.

## O que será entregue

1. **Cálculo isolado dos filtros**: o progresso passa a ser feito sobre todos os agenciamentos do corretor (trilha atual), ignorando período, status, imobiliária e checklist da tela. Só o seletor de corretor continua influenciando.

2. **Painel de bonificações explicativo** (trilha Venda, mês corrente):
   - "18 no mês · 10 válidos para bonificação · 8 com placa";
   - linha destacando os **8 agenciamentos fora da conta** com o motivo agregado (ex.: "6 sem fotos verticais, 3 sem cadastro Cordial"), clicável para filtrar a lista e resolver;
   - texto do progresso reescrito: "Bonificação nº 2 de agosto: faltam 6 captações válidas (10/16) e 0 placas (8/8)", deixando claro que a nº 1 já foi conquistada.
   - Na trilha Aluguel, o mesmo formato com o acumulado total ("25 válidos · 2 bonificações · faltam 5 para a nº 3").

3. **Coerência do cabeçalho**: o contador grande do topo passa a mostrar as captações da trilha no período filtrado com legenda explícita, e o painel de bonificação indica o mês/ciclo que está sendo medido, para não confundir "todo período" com "ciclo do mês".

4. **Conferência para todos os corretores**: rodo a mesma verificação (agenciamentos válidos × bonificações registradas) para cada corretor após o ajuste e reporto o resultado.

## Detalhes técnicos

- `src/routes/_app.agenciamentos.tsx`: `bonusScopeAgenciamentos` deixa de derivar de `visibleAgenciamentos` (já filtrado) e passa a derivar da lista completa carregada pelo hook, aplicando apenas o recorte por corretor.
- `src/hooks/useAgenciamentos.ts`: expor a coleção sem filtros de UI (`allAgenciamentos`) para o cálculo de bonificação.
- `src/lib/agenciamentos/track.ts`: `computeBonusProgress` passa a devolver também `totalNoCiclo`, `bloqueados` e a contagem de itens de checklist faltantes; novo helper `summarizeBlockingChecklist(items)`.
- `src/components/agenciamentos/AgenciamentoBonusPanel.tsx`: nova linha de composição (no mês / válidos / com placa), bloco de pendências clicável e texto de progresso reescrito.
- Sem mudança de banco: `agenciamento_bonus_recalc` já aplica a mesma regra e os registros existentes conferem.
- Testes em `src/lib/agenciamentos/` cobrindo progresso com checklist incompleto, trilha aluguel acumulada e independência de filtros.
