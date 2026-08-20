# Painel — Card "Corretores no período" com bonificações reais

Refazer o bloco de performance da equipe na visão geral: dados reais por corretor, bonificações no lugar da comissão prevista, filtros inteligentes e visual mais elegante.

## O que muda

1. **Bonificações no lugar de "Prevista"**
   - O indicador em destaque passa a mostrar a **quantidade de bonificações conquistadas** pela equipe no período (registros de bonificação por corretor).
   - Na lista de corretores, o valor à direita (hoje "R$ 18k") passa a ser a **quantidade de bonificações** daquele corretor, com detalhe de quantas já foram pagas/aprovadas e quantas estão pendentes.

2. **Dados reais por corretor**
   - Os totais de contratos, conversão e agenciamentos continuam vindo da base; as bonificações passam a ser lidas do registro real de bonificações, respeitando o período selecionado (bonificações sem período de referência entram sempre).
   - Nada de números fixos ou fallback fictício: se uma fonte falhar, o card mostra o estado de indisponibilidade em vez de zero silencioso.

3. **Filtros inteligentes**
   - Seletor de período (Mês, 30 dias, Trimestre, Ano) no próprio card, sincronizado com o gráfico de performance ao lado.
   - Filtro de imobiliária (Todas / Cordial / Morar).
   - Ordenação do ranking: por bonificações, contratos, atendimentos ou conversão — com o Top 5 (em vez de Top 3) e link para a tela completa de corretores.
   - Estados de carregamento, erro e "sem dados no período" tratados explicitamente.

4. **Visual e tipografia**
   - Cabeçalho mais enxuto: rótulo, título e ações (filtros + "Ver corretores") em uma linha compacta.
   - Métricas em grade de 4 com números tabulares, hierarquia tipográfica mais firme (rótulo pequeno em caixa alta discreta, número grande com tracking negativo) e apenas um card em destaque — o de bonificações.
   - Linhas do ranking com barra de progresso proporcional à métrica ordenada, medalha só no primeiro lugar e menos ruído (menos anéis, sombras mais suaves).
   - Todas as cores via tokens do design system existente, mantendo coerência com os demais cards do painel.

## Detalhes técnicos

- `src/lib/equipe/equipe.functions.ts`: incluir agregação de `agenciamento_bonuses` por `corretor_id` no período, retornando por corretor `bonificacoesTotal`, `bonificacoesPagas`, `bonificacoesPendentes`, além do total da equipe; adicionar `bonificacoes` ao `sourceStatus`.
- `src/types/corretor.ts` e `src/services/corretores.ts`: novos campos no tipo `Corretor` / `CorretoresSummary`, normalização e nova chave de ordenação `bonificacoes` em `rankCorretores`.
- `src/routes/_app.index.tsx`: extrair `TeamPerformanceCard` para `src/components/dashboard/TeamPerformanceCard.tsx`, alimentado por `useEquipePerformance` (mesmo período do gráfico) com estado local de imobiliária e ordenação.
- Sem migração de banco: a tabela `agenciamento_bonuses` já existe com os dados reais.

## Correção pendente (build)

- `src/lib/imobibrasil/serializers.test.ts` importa `vitest`, que não está instalado (o projeto roda testes com `node --test`). Na execução do plano, converto esse arquivo para o mesmo padrão `node:test` / `node:assert` dos demais testes e o incluo no script `test`, resolvendo o erro de build TS2307.
