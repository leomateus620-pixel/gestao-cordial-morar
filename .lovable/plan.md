## Diagnóstico

Verifiquei o estado atual:

- **RLS `public.real_estate_sales`**: já é `user_id = auth.uid() OR has_role('admin')` em `SELECT/UPDATE/DELETE` e `INSERT` com `WITH CHECK user_id = auth.uid()`. Isso já garante "corretor vê só as próprias, admin vê tudo" — não precisa alterar.
- **Permissões do app** (`src/lib/mock/permissions.ts`): o perfil `corretor` **não** inclui o módulo `vendas` nem `vendas:read/write` — por isso o menu está bloqueado no sidebar/mobile e via `RequireModuleAccess`.
- **`createSale`** (`src/lib/sales/sales.functions.ts`) já grava `user_id = context.userId`, o que faz o RLS funcionar corretamente.
- **`listSales`** retorna as vendas sem o nome do dono; hoje só existe o campo texto livre "Responsável" preenchido pelo usuário — para admin ver "corretor responsável" de forma confiável, precisa vir o nome do dono via join com `profiles`.
- **KPIs** (`getSalesKpis`) são calculados server-side sobre o resultado do próprio `SELECT` (portanto já respeitam o RLS por usuário). "Ticket médio" aparece em `SalesKpiCards.tsx` como um dos 6 cards.

## O que fazer

1. **Liberar módulo Vendas para corretor** — em `src/lib/mock/permissions.ts`, adicionar `"vendas"` ao array `modules` e `"vendas:read"`, `"vendas:write"` ao array `permissions` do perfil `corretor`. Nenhuma outra role muda.

2. **Ocultar "Ticket médio" para não-admins** — em `src/components/vendas/SalesKpiCards.tsx` receber uma flag `isAdmin` (ou usar `useSession` + `isAdminUser`) e renderizar o KpiCard "Ticket médio" apenas quando admin. Ajustar grid para continuar equilibrado (5 cards em vez de 6 para corretor). Passar a prop no `_app.vendas.tsx`.

3. **Garantir que admin sempre veja o corretor responsável** — em `src/lib/sales/sales.functions.ts`:
   - `listSales`: incluir o dono via `select("*, owner:profiles!user_id(id, nome, iniciais)")` e mapear para novos campos `ownerId` / `ownerName` / `ownerInitials` no `SaleRecord` (tipo em `src/types/sale.ts`).
   - Exibir esse nome do dono em `SaleRecordCard.tsx` e `SaleDetailsDrawer.tsx` como "Corretor" (linha nova, separada do campo texto livre "Responsável"). Para o corretor, essa linha simplesmente mostra o próprio nome (informação já era conhecida, sem vazamento). Para admin, resolve a lacuna atual em que "Responsável" pode estar vazio.

4. **Pré-preencher "Responsável" com o corretor logado** — em `src/components/vendas/SaleForm.tsx`, quando é uma criação e o usuário é corretor, iniciar `responsibleAgent` com `session.nome` (sem travar; ele pode alterar, mas o RLS + `user_id` continuam garantindo isolamento).

5. **Validação (via Playwright, headless)**:
   - Login corretor (Felipe): abre `/vendas`, cria uma venda, salva, vê apenas ela na lista e nos KPIs; card "Ticket médio" **não aparece**; card mostra corretor = Felipe.
   - Login admin (Bruna): abre `/vendas`, vê a venda do Felipe e as próprias, card "Ticket médio" aparece, cada card mostra o corretor dono correto.
   - Login outro corretor (Pablo): não vê a venda do Felipe.
   - Screenshots de cada etapa para confirmação visual.

## Detalhes técnicos

- Sem mudanças de RLS (já correto para o requisito).
- Sem mudanças em secretária/financeiro — pedido é apenas para corretor.
- Mudanças isoladas: 1 arquivo de permissão, 1 componente KPI, 1 rota, 1 server-fn + tipo, 1 form, 2 cards de exibição.
- Nenhuma migração de dados; join com `profiles` usa a FK implícita `user_id → auth.users` — como não existe FK direta no `profiles`, o alias no `select` usa `profiles!left(id, nome, iniciais)` com filtro por `user_id`, ou uma segunda query em batch (`.in("id", userIds)`) caso o embed não resolva. Confirmarei na implementação e adotarei a via que o PostgREST aceitar.
