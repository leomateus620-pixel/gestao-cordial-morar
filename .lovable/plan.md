# Corretores: métricas confiáveis, sem comissão

## O que foi verificado agora

- **Tempo de resposta**: o cálculo existe e é real (atribuição → primeira abertura persistida), mas o card mostra a **média**, que está distorcida por poucos casos extremos. Nos 97 ciclos registrados: 76 abertos, 21 pendentes, o mais rápido em 1 segundo e o mais lento em **7,9 dias**. Isso puxa a média para ~1d18h, enquanto o comportamento típico é muito mais rápido.
- **Visão por corretor**: há inconsistência de fonte. "Fechados" vem de Vendas + Contratos de aluguel, enquanto "Conversão" vem do funil de Atendimentos (etapa Fechamento). Por isso o Felipe aparece com 4 fechados e 9% de conversão — dois números que não conversam.
- **Atendimentos sem corretor**: neste mês há **95 atendimentos sem corretor responsável** (contra ~36 atribuídos). Eles não entram em nenhum corretor e hoje isso não é sinalizado no menu.
- **Comissões**: vêm de `commission_value` das vendas e do plano de parcelas; os valores exibidos (ex.: R$ 79k) não refletem a operação real.

## O que será feito

### 1. Remover comissões do menu Corretores
- Sai o card "Comissão prevista" do resumo, os blocos "Comissão prevista / Comissão paga" de cada card de corretor, o painel "Comissões" no detalhe do corretor e a opção de ordenação "Comissão prevista".
- O espaço liberado passa a destacar **Atendimentos, Fechados, Conversão, Agenciamentos e Bonificações**.
- Nada é removido do módulo Vendas/Financeiro — a mudança é só de exibição em Corretores.

### 2. Tempo de resposta correto e honesto
- A **mediana** vira o número principal (comportamento típico), com a média mostrada como referência secundária.
- Exibição do mais rápido / mais lento por corretor, deixando o outlier visível em vez de escondido dentro da média.
- Ciclos acima de 72h passam a ser contados como "sem retorno no prazo" e sinalizados, em vez de simplesmente inflarem a média.
- Continua contando apenas ciclos com atribuição e primeira abertura persistidas; pendentes seguem separados.

### 3. Coerência dos dados por corretor
- "Fechados" e "Conversão" passam a usar a mesma base do funil de Atendimentos (etapa Fechamento), com Vendas e Aluguéis exibidos como linhas próprias e rotuladas pela sua origem.
- Rótulos ajustados para deixar claro de onde vem cada número (funil de atendimentos vs. contratos registrados).
- Novo indicador no resumo: **atendimentos sem corretor responsável no período**, para que o gestor veja o que está fora da atribuição em vez de os números "sumirem".
- Os filtros (período, imobiliária, corretor, status) continuam aplicados de forma idêntica a todos os blocos, incluindo o card de tempo de resposta.

## Detalhes técnicos

- Frontend: `CorretoresSummaryCards.tsx`, `CorretorCard.tsx`, `CorretorDetailDrawer.tsx`, `CorretoresRanking.tsx`, `CorretoresFilters.tsx`, `CorretoresResponseTimeCard.tsx`.
- Agregação: `src/services/corretores.ts` (conversão/fechados na mesma base, contagem de não atribuídos, classificação de outliers de resposta) e `src/lib/equipe/equipe.functions.ts` (expor total de atendimentos sem corretor no período).
- Tipos: remover campos de comissão do consumo em `src/types/corretor.ts` apenas onde deixarem de ser usados na UI, mantendo compatibilidade com outros módulos.
- Sem alteração de schema nem de RLS; o RPC `get_corretores_response_metrics` já retorna mediana, que passará a ser usada.
