## Problema
No modal "Novo atendimento" o seletor de corretor mostra a lista mock hardcoded em `atendimentoBrokerOptions` (Ricardo, Bruna, Bianca, Felipe, Marcos, Paula, A definir) em vez dos corretores reais já hidratados do Supabase pelo `useHydrateCorretores`. Por isso Paula/Marcos aparecem e Geandre (real) não.

## Correção
Trocar a fonte da lista no `AtendimentoFormModal` para os corretores reais do store, sem tocar em outros menus.

### Passos
1. `src/components/atendimentos/AtendimentoFormModal.tsx`
   - Remover uso de `atendimentoBrokerOptions` no `<select>` e no lookup do label.
   - Ler os corretores reais via `useApp((s) => s.corretores)` (ou `useCorretores()`), ordenados por nome, e renderizar `<option value={c.id}>{c.nome}</option>` mais o item fixo "A definir".
   - Ajustar o cálculo de `corretorNome` para usar o nome do corretor selecionado dessa lista.
   - Manter o restante do formulário intacto.

2. `src/types/atendimento.ts`
   - Remover a constante `atendimentoBrokerOptions` (não é mais referenciada) para eliminar o mock em definitivo. Antes de remover, confirmar via `rg` que nada mais a importa; se algum outro arquivo ainda usar, apenas remover Paula e Marcos da lista e adicionar Geandre como fallback — mas o objetivo é remover a constante inteira.

### Fora do escopo
- Não alterar cadastro/edição de usuários no Supabase (Geandre já existe como corretor, então aparecerá automaticamente na lista hidratada).
- Não mexer em outros menus.

### Validação
- `bunx tsgo --noEmit`.
- Abrir modal de novo atendimento e conferir que a lista mostra apenas os corretores reais (incluindo Geandre) e "A definir", sem Paula/Marcos.
