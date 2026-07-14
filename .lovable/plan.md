## Ajuste

Hoje o hook `useHydrateCorretores` popula o store com todos os usuários cujo papel é `corretor` OU `admin`. O pedido é: mostrar apenas os corretores.

## Mudança

Em `src/hooks/useHydrateCorretores.ts`, filtrar a resposta do RPC `list_corretores` para incluir somente `role === "corretor"` antes de mapear para o tipo `Corretor` e chamar `useApp.setState({ corretores })`.

Efeito imediato:
- Página `/corretores`, dashboard `/`, `/relatorios`, `/configuracoes` (KPI Equipe) e todos os seletores (agenciamentos, agenda, vendas, novo compromisso) passarão a listar apenas Felipe, Pablo e futuros usuários com papel `corretor`.
- Administradores (Leonardo, Bruna, Ricardo) e secretária deixam de aparecer nessas listas.

## Fora de escopo

- Não altera a função SQL `list_corretores` (continua retornando ambos os papéis, o que é inofensivo — filtragem acontece no front). Se preferir, altero também a função para retornar só `corretor`; me avise.
- Nenhuma mudança em permissões, rotas ou métricas.

## Arquivo afetado

- `src/hooks/useHydrateCorretores.ts`
