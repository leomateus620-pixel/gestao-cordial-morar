## Problema

Corretores não conseguem editar clientes que foram criados por outra pessoa (ex.: Bianca cria o cliente e vincula ao corretor). O RLS do Postgres já permite a edição para o corretor vinculado (`assigned_broker_id = auth.uid()`), mas o gate de UI bloqueia com o toast "Você só pode editar cadastros que você criou".

## Causa raiz

Em duas telas o `canEdit` só considera `createdBy`:

- `src/routes/_app.clientes.tsx` (lista) — `canEditClient` retorna `client.createdBy === session.id` para não-admin.
- `src/routes/_app.clientes.$clienteId.tsx` (detalhe) — mesma regra.

Isso diverge da policy `clients_update_editable` que permite: criador, corretor vinculado, admin ou secretaria.

## Correção

Alinhar o gate de UI à RLS. Não é um problema geral — funciona para admin/secretaria e para clientes criados pelo próprio corretor; só falha no caso "atribuído por outro".

1. **`src/routes/_app.clientes.tsx`** — em `canEditClient`, permitir também quando `client.assignedBrokerId === session.id`, e liberar para `secretaria` (equipara-se ao acesso já concedido no backend).
2. **`src/routes/_app.clientes.$clienteId.tsx`** — mesma regra no `canEdit` do header do detalhe.
3. Nenhuma alteração de schema, RLS ou server function é necessária.

## Validação

- Login como corretor (ex.: Geandre) → abrir cliente atribuído a ele criado pela Bianca → botão "Editar" visível, salvar altera o registro e persiste após refresh.
- Login como corretor → cliente atribuído a outro corretor → botão não aparece (RLS também bloquearia).
- Login como Bianca/admin → continua editando tudo.
