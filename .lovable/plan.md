## Objetivo
O seletor Vendas/Aluguéis deve contar **apenas** atendimentos com finalidade explícita da sua trilha, sem duplicar registros legados marcados como `ambos`.

## O que muda

### 1. Reclassificar registros legados (migração única)
Atualizar todos os atendimentos existentes com `finalidade = 'ambos'` para `finalidade = 'compra'` (padrão da imobiliária). Migração pontual, executada uma vez.

### 2. Filtragem canônica por trilha (`src/lib/atendimentos/track.ts`)
Remover o comportamento em que `ambos` cai nas duas trilhas. Passa a valer estritamente:
- Vendas → `finalidade = "compra"`
- Aluguéis → `finalidade = "aluguel"`
- `ambos` → não conta em nenhuma (só sobra para casos que o usuário criar manualmente no futuro)

### 3. Formulário de novo atendimento (`AtendimentoFormModal.tsx`)
A opção "Ambos" já está oculta em novos cadastros desde a implementação anterior. Nada a fazer.

### 4. Nada muda em Vendas nem Aluguéis
O seletor sempre leu apenas a tabela `attendances` — em nenhum momento consultou `sales` ou `rental_contracts`. Só corrigimos a lógica de dupla contagem.

## Verificação
- Após a migração, `SELECT finalidade, count(*) FROM attendances GROUP BY finalidade` não deve retornar `ambos`.
- Total do seletor = total de atendimentos ativos (sem sobreposição).
- Typecheck limpo.
