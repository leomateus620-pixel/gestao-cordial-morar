## Correção
Incluir usuários admin (Bruna, Ricardo) na lista de corretores hidratada, já que também atuam como corretores.

### Passo
- `src/hooks/useHydrateCorretores.ts`: trocar o filtro `p.role === "corretor"` por `p.role === "corretor" || p.role === "admin"` (exclui apenas a secretaria).

### Efeito
Admins passam a aparecer nos seletores de corretor de Atendimentos (formulário, filtros, ações) e em qualquer outro lugar que consuma `state.corretores`.

### Fora do escopo
- Não alterar RPC `list_corretores` nem regras de acesso.
- Não mexer em outros menus.
