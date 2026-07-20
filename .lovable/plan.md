## Diagnóstico

Confirmei a causa raiz consultando as políticas RLS reais no banco:

- `public.clients` — política `SELECT` atual: `created_by = auth.uid() OR has_role(auth.uid(),'admin')`. **Não inclui o corretor atribuído (`assigned_broker_id`) nem a secretária.**
- `public.attendances` — política `SELECT`: já inclui `corretor_id = auth.uid()` e admin, mas **não inclui a secretária**.

Fluxo quebrado hoje: quando Bianca (secretária) cria um atendimento e vincula ao Felipe (corretor), a conversão em cliente chama `createClient` como Bianca — portanto `created_by = Bianca` e `assigned_broker_id = Felipe`. O RLS do `clients` só deixa Bianca e admins lerem essa linha; Felipe cai fora, mesmo sendo o corretor responsável. O filtro do server-fn `listClients` já tenta um `.or(created_by, assigned_broker_id)`, mas o RLS bloqueia antes.

Também: a secretária hoje só vê os próprios atendimentos/clientes — o pedido é que ela veja tudo, como admin (sem privilégios administrativos).

## O que corrigir

1. **RLS `public.clients`** — nova política `SELECT` (e `UPDATE`) permitindo:
   - criador (`created_by = auth.uid()`)
   - corretor atribuído (`assigned_broker_id = auth.uid()`)
   - admin (`has_role(...,'admin')`)
   - secretária (`has_role(...,'secretaria')`)

   `DELETE` continua restrito a criador + admin (secretária não apaga cadastro de outro corretor).

2. **RLS `public.attendances`** — adicionar bypass de leitura/edição para `secretaria` nas políticas `SELECT` e `UPDATE` (mantendo criador, corretor vinculado, admin). `DELETE` segue criador + admin.

3. **Server-fn `listClients`** (`src/lib/clients/clients.functions.ts`) — hoje só pula o filtro quando `isAdmin`. Passar a pular também quando o usuário tiver role `secretaria`, para ela receber toda a lista (paralelo ao que já é feito em `listAttendances`).

4. **Server-fn `listAttendances`** (`src/lib/attendances/attendances.functions.ts`) — mesmo ajuste: pular o filtro `.or(...)` quando o usuário for `secretaria`.

Nada muda no fluxo de conversão em si (`convertAtendimento` em `useAttendances.ts` continua criando o cliente com `assigned_broker_id = corretor do atendimento`); o RLS corrigido é o que faz o cliente aparecer para o corretor.

## Validação após aplicar

- Login Felipe: cliente convertido de um atendimento vinculado a ele aparece no menu Clientes.
- Login Bianca: vê todos os atendimentos e todos os clientes de todos os corretores; consegue editar.
- Login admin (Ricardo/Bruna/Leonardo): sem regressão — continua vendo tudo.
- Login outro corretor não vinculado: não vê o cliente/atendimento alheio.

## Detalhes técnicos

- Uma migration Supabase com `DROP POLICY ... IF EXISTS` + `CREATE POLICY` para as 4 políticas afetadas (`clients` SELECT/UPDATE, `attendances` SELECT/UPDATE). RLS já está habilitado e os `GRANT`s já existem — nada a mexer aí.
- Edits pontuais em dois arquivos `.functions.ts` para consultar `has_role(..., 'secretaria')` em paralelo ao check de admin (uma única chamada RPC `has_role` extra por request; barato).
- Sem mudanças de UI, tipos ou hooks.
