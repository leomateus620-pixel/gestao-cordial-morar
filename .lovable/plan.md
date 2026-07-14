## Objetivo
Criar a conta de **geandrecarpenedo2@gmail.com** com senha **Geandre4545**, já confirmada, com papel **corretor**, e garantir que apareça imediatamente nos seletores de corretor dos menus (agenciamentos, agenda, vendas, novo compromisso, financeiro, relatórios).

## Execução (uma única ação em build mode)

Script pontual via `code--exec` usando `SUPABASE_SERVICE_ROLE_KEY` (não fica no código do app):

1. `POST` para a **Auth Admin API** (`/auth/v1/admin/users`) criando o usuário:
   - `email: geandrecarpenedo2@gmail.com`
   - `password: Geandre4545`
   - `email_confirm: true` (login imediato, sem precisar confirmar caixa de entrada)
   - `user_metadata: { nome: "Geandre Carpenedo" }`

2. A trigger `handle_new_user` do banco dispara automaticamente e:
   - Cria a linha em `public.profiles` com nome, email e iniciais.
   - Atribui o papel: como já existem 3+ admins cadastrados, cai no ramo padrão e recebe `corretor` em `public.user_roles`.

3. Verificação via `supabase--read_query`:
   - Confirmar que existe 1 profile e 1 user_role='corretor' para o novo `user_id`.
   - Se por algum motivo o papel não vier como `corretor` (ex.: contagem de admins < 3), corrigir com `supabase--insert` normalizando para `corretor`.

## Efeito na aplicação
- O hook `useHydrateCorretores` chama `list_corretores()` e filtra `role === "corretor"` → o novo usuário aparece automaticamente na próxima carga da tela, sem alteração de código.
- Ele já pode fazer login em `/auth` com email e senha informados e ser selecionado em todos os cadastros que usam a lista de corretores.

## Fora de escopo
- Nenhuma mudança de código, migration ou UI.
- Nenhuma nova permissão/módulo além do padrão de `corretor`.
