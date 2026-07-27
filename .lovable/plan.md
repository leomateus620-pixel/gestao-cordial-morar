## Objetivo
Liberar a exclusão de agenciamentos para todos os usuários autenticados (admin, secretaria e corretor), mantendo o restante das regras do módulo intactas.

## Situação atual
- **Banco**: a política `agenciamentos_delete_admin` permite `DELETE` apenas para `admin`.
- **Hook `useAgenciamentos.ts`**: `remove()` exige `canManage` (admin/secretaria) antes de chamar o server function.
- **UI**: `AgenciamentoCard` e `AgenciamentoDetailDrawer` só exibem o botão "Excluir" quando `canManage` é verdadeiro.

Resultado: corretores nunca veem o botão e, mesmo se vissem, o hook e o RLS bloqueariam.

## Mudanças

1. **Migração de RLS** (`agenciamentos`)
   - Remover `agenciamentos_delete_admin`.
   - Criar `agenciamentos_delete_all_authenticated` permitindo `DELETE` para qualquer usuário autenticado (`TO authenticated USING (true)`).

2. **`src/hooks/useAgenciamentos.ts`**
   - Em `remove`, trocar a checagem `!session || !canManage` por apenas `!session`, para que qualquer usuário logado possa disparar a exclusão.

3. **`src/components/agenciamentos/AgenciamentoCard.tsx`**
   - Exibir o botão de excluir sempre que `onDelete` estiver presente (remover o gate `canManage`), mantendo o mesmo estilo/ícone atual.

4. **`src/components/agenciamentos/AgenciamentoDetailDrawer.tsx`**
   - Mesmo ajuste: mostrar o botão "Excluir" para qualquer usuário com `onDelete` disponível.

5. **`src/routes/_app.agenciamentos.tsx`** *(se necessário)*
   - Garantir que `requestDelete` seja passado independentemente do perfil (hoje já é passado; apenas confirmar após edição dos componentes).

## Fora do escopo
- Sem mudanças em criação, edição, validação ou visualização.
- Sem mudanças em outros módulos.
- Diálogo de confirmação (`AlertDialog`) já existente é mantido — evita exclusões acidentais.

## Detalhes técnicos
- A política nova continua respeitando `SELECT` existente: um corretor só verá (e portanto só poderá excluir) os agenciamentos que já são visíveis para ele. Admin/secretaria continuam vendo tudo.
- Nenhuma alteração de schema, apenas policy.