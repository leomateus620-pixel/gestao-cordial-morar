## Objetivo
Mover o menu **Clientes** de mock/local para Supabase, mantendo a UI atual (filtros, busca, modal em 4 etapas, métricas, card "Criar cadastro") e respeitando isolamento por usuário/imobiliária via RLS.

## 1. Banco (migration nova)

Tabela `public.clients` (novo nome, evita colisão com `Cliente` mock):

Campos principais:
- `id uuid pk`, `created_by uuid` (auth.users), `brand text` (`cordial|morar|ambas`)
- Identificação: `full_name`, `phone`, `email`, `document`, `client_type`, `contact_preference`
- Origem/vínculo: `lead_origin`, `assigned_broker_id`, `assigned_broker_name`, `status`
- Interesse: `purpose`, `property_type`, `bedrooms`, `neighborhood`, `min_budget`, `max_budget`
- Complementares: `approximate_income`, `profession`, `notes`, `restrictions`, `next_step`, `next_follow_up_at`
- `created_at`, `updated_at` + trigger `touch_updated_at`

**Grants + RLS** (mesmo padrão de `attendances`):
- `GRANT ... TO authenticated; GRANT ALL ... TO service_role`
- Policies: SELECT/INSERT/UPDATE/DELETE quando `created_by = auth.uid()` OU `has_role(auth.uid(),'admin')`
- INSERT força `created_by = auth.uid()`

## 2. Server functions (`src/lib/clients/clients.functions.ts`)

`listClients`, `createClient`, `updateClient`, `deleteClient` — todas com `requireSupabaseAuth`, validação Zod, mapeamento snake_case ↔ tipo `Client`.

## 3. Hook `useClients` (substitui o atual)

- Trocar leitura do Zustand por `useQuery(['clients'])` via `useServerFn(listClients)`.
- `useCreateClient` (mutation) faz invalidate de `['clients']`.
- Manter `ClientFilters`, busca, e regras de stats (`getClientStats`, `matchesBudget`) — passam a operar sobre dados reais retornados.

## 4. UI `/clientes` (`src/routes/_app.clientes.tsx`)

- Mantém layout (filtros, ClientCreateCard, summary cards, lista).
- `createClient` agora aguarda mutation, mostra toast (sonner) de sucesso/erro, mantém modal aberto em erro.
- Empty state profissional (sem dados / sem resultados de filtro) com CTA "Criar cadastro".
- `ClientFormModal`: `onSubmit` vira async, botão mostra "Salvando…", só fecha em sucesso, mantém form preenchido em erro.

## 5. Compatibilidade do detail `/_app/clientes/$clienteId`

A rota hoje lê `cliente.nome/iniciais/telefone/etc.` do store. Vou:
- Adicionar `useClientById(id)` que pega da query `['clients']` e adaptar a rota para usar o tipo `Client` (`fullName`, `phone`, `email`, `document`, `createdAt`, `brand`, etc.) usando os helpers de `services/clients.ts`. Sem mudar layout visual.

## 6. Limpeza de mocks

- `clientesSeed` em `src/lib/mock/data.ts` → `[]` (tipo preservado).
- `app-store`: remover `clientes`, `addCliente`, `convertAtendimentoToCliente` (ou redirecionar a conversão para `createClient` via mutation chamada no componente que dispara a conversão — checar uso).
- `NovoClienteSheet` (atalho do dashboard) passa a usar `useCreateClient`.
- Remover qualquer leitura residual de `state.clientes`.

## 7. Corretores

`brokerOptions` continua como lista estática (não há tabela `brokers` real). Permite "A definir" (null). Não bloqueia cadastro.

## 8. Isolamento

- RLS por `created_by` + admin override.
- `brand` salvo conforme imobiliária selecionada no modal; filtro topo (Todas/Cordial/Morar) só recorta visual.

## 9. Validação

- `bun run build` e `tsgo --noEmit`.
- Testar: criar cliente, recarregar página, filtros Todas/Cordial/Morar, busca, empty state, mobile.

## Arquivos
**Criar:** migration `clients`, `src/lib/clients/clients.functions.ts`, `src/hooks/useClientById.ts`
**Editar:** `src/hooks/useClients.ts`, `src/routes/_app.clientes.tsx`, `src/routes/_app.clientes.$clienteId.tsx`, `src/components/clients/ClientFormModal.tsx`, `src/components/sheets/novo-cliente.tsx`, `src/store/app-store.ts`, `src/lib/mock/data.ts`, `src/integrations/supabase/types.ts` (auto após migration)
