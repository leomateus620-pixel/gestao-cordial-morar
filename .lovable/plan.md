## Diagnóstico (verificado no banco)

Consultei o banco: os agenciamentos criados pelo Felipe (`d87eda8c-…`) **estão persistidos corretamente**, com `created_by = <uid do Felipe>` **e** `corretor_id = <uid do Felipe>` (7 registros, do mais recente ao mais antigo). Ou seja, o `INSERT`, o trigger e o RLS estão OK — o servidor devolve os registros para ele (a policy `agenciamentos_select_own_or_assigned` autoriza por `created_by` OU `corretor_id`, e o `listAgenciamentos` faz `.or(created_by.eq.<uid>,corretor_id.eq.<uid>)`).

O problema está no **filtro redundante do lado do cliente**, em `src/hooks/useAgenciamentos.ts` + `src/services/agenciamentos.ts`:

1. `getAgenciamentosVisibleToUser(...)` refiltra tudo por `item.corretorId === corretorId`. `corretorId` vem de `effectiveBrokerId = currentBroker?.id ?? session?.id`. Se, no primeiro render após F5, `currentBroker` ainda não foi resolvido (a lista de corretores carrega via `useHydrateCorretores` de forma assíncrona) **e** o `session` ainda está sendo hidratado por `getSession()`/`onAuthStateChange`, `corretorId` fica `undefined` e a função retorna `[]` — resultado: "sumiram os agenciamentos". Além disso, qualquer registro cujo `corretorId` não bata exatamente com o `effectiveBrokerId` (histórico antigo, duplicidade de perfil, cadastro criado por Bianca e atribuído a outro corretor mas vinculado ao Felipe por `created_by`) é escondido, mesmo o servidor tendo autorizado.
2. `effectiveFilters.corretorId` força, para não-admin, `effectiveBrokerId ?? "__sem_corretor__"`. Quando `effectiveBrokerId` é momentaneamente `undefined`, o filtro vira `"__sem_corretor__"` e nenhum item passa (`filterAgenciamentos` compara igualdade exata).

Ambos os pontos duplicam a lógica que já é aplicada com segurança pelo RLS + `.or` no servidor, e criam janelas de "lista vazia" após refresh.

## Mudanças

1. **`src/services/agenciamentos.ts`**
   - Simplificar `getAgenciamentosVisibleToUser`: retornar sempre `agenciamentos` quando houver sessão (servidor já filtra). Manter guarda para `!user` retornando `[]`.
   - Não alterar `canEditAgenciamento` — a regra de edição continua válida.

2. **`src/hooks/useAgenciamentos.ts`**
   - Remover a sobreposição de `effectiveFilters.corretorId` para não-admin. Passar `filters` direto para `filterAgenciamentos`, respeitando a escolha do usuário (default `"todos"` já cobre o caso de corretor querendo ver "os seus", pois o servidor só devolve os dele).
   - `visibleAgenciamentos` continua útil para `dashboardAgenciamentos`/ranking; mantém o cálculo mas sem filtrar por `corretorId` no cliente.

3. **Verificação (após aplicar o build)**
   - Solicitar reprodução com login do Felipe: cadastrar 1 agenciamento novo, dar F5 e confirmar que aparece na lista, no card horizontal e no drawer.
   - Repetir com Pablo (corretor) e Bianca (secretária) para garantir que:
     - Corretor vê apenas os seus (garantido por RLS).
     - Secretária/admin vêem todos.
   - Se preferir, posso pedir credenciais de teste do Felipe para rodar via Playwright na próxima etapa e validar automaticamente.

## Fora de escopo

- Sem alterações em RLS, schema ou server functions (`agenciamentos.functions.ts`) — o servidor já está correto.
- Sem alterações em UI, criação, edição, validação ou exclusão.
- Sem mudanças em outros módulos.

## Detalhes técnicos

- A remoção do refiltro por `corretorId` no cliente elimina a corrida entre `useSession()` (Supabase auth) e `useHydrateCorretores()` (RPC `list_corretores`) que hoje pode esconder registros por 1–2 renders.
- Segurança preservada: como `listAgenciamentos` é `requireSupabaseAuth` e aplica `.or(created_by.eq.<uid>,corretor_id.eq.<uid>)` para não-admin, o cliente só recebe o que o corretor pode ver. Não há risco de vazar dados de outros corretores.
- O comportamento para admin/secretaria não muda (já viam tudo).
