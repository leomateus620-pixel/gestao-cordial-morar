# Plano — Menu Agenciamentos em produção

## Diagnóstico

- A UI já existe (`src/components/agenciamentos/*`, `src/routes/_app.agenciamentos.tsx`, hook `useAgenciamentos`) e está completa em filtros, métricas, ranking, checklist e modal de cadastro.
- **Toda a persistência hoje é mock**: `useAgenciamentos` lê/escreve no `useApp` (Zustand + localStorage) que inicializa com `agenciamentosSeed` do `src/lib/mock/data.ts`. Nenhuma tabela `agenciamentos` existe no Supabase.
- Padrão de referência já adotado pelo projeto (Atendimentos): tabela `public.<entidade>` com `created_by`, coluna `imobiliaria text CHECK in ('cordial','morar','ambas')`, RLS "dono ou admin", server functions em `src/lib/<entidade>/<entidade>.functions.ts` usando `requireSupabaseAuth`, hook chamando via `useServerFn` + TanStack Query. Vou seguir esse padrão.
- Perfis: `user_roles` com enum `app_role` ('admin','corretor',...) e função `has_role(uuid, app_role)`. Sessão atual via `useSession` (mock) expõe `perfil`, `permissions`, `iniciais`, `nome`. O hook já distingue admin vs corretor — só precisa passar a operar sobre dados do banco.
- Tenant/imobiliária: o projeto não tem `tenant_id` separado; o isolamento Cordial/Morar é feito pelo campo `imobiliaria` no próprio registro (igual a Atendimentos/Agenda). Mantenho esse padrão.

## Entregáveis

### 1. Migração Supabase (`supabase/migrations/<ts>_agenciamentos.sql`)

Tabela `public.agenciamentos` espelhando o tipo `Agenciamento` (snake_case):

- `id uuid pk default gen_random_uuid()`
- `created_by uuid not null references auth.users(id) on delete cascade`
- `imobiliaria text not null check (in ('cordial','morar','ambas'))`
- Imóvel: `tipo_imovel`, `endereco`, `bairro`, `cidade`, `descricao_imovel`
- Proprietário: `proprietario_nome`, `proprietario_telefone`, `proprietario_contato_preferencial`, `proprietario_observacoes`
- Responsável: `corretor_id text`, `corretor_nome text`, `data_agenciamento date not null`, `origem text`, `status text not null default 'novo'`
- Checklist (booleans): `fotos_realizadas`, `fotos_drive`, `placa_instalada`, `cadastrado_site`, `video_realizado`, `validado`
- Links/notas: `drive_folder_url`, `site_url`, `observacoes_internas`
- Auditoria: `criado_por_nome`, `validado_por_id uuid`, `validado_por_nome`, `validado_em timestamptz`
- `created_at`, `updated_at` + trigger `touch_updated_at`
- Índices em `created_by`, `corretor_id`, `created_at desc`, `status`, `imobiliaria`

GRANTs (`authenticated` CRUD, `service_role` ALL) e RLS:

- **SELECT**: `created_by = auth.uid()` OR `corretor_id = auth.uid()::text` OR `has_role(auth.uid(),'admin')`
- **INSERT**: `created_by = auth.uid()`; se não-admin, `validado=false` é forçado via trigger (`agenciamentos_enforce_validation`) que zera `validado/validado_por_*/validado_em` quando o usuário não for admin
- **UPDATE**: `created_by = auth.uid()` OR `corretor_id = auth.uid()::text` OR admin; o mesmo trigger impede que não-admin marque `validado=true` ou mude `corretor_id` para outro usuário
- **DELETE**: apenas admin

### 2. Server functions (`src/lib/agenciamentos/agenciamentos.functions.ts`)

- `listAgenciamentos` (GET, `requireSupabaseAuth`) — `select *` (RLS já filtra) ordenado por `created_at desc`
- `createAgenciamento` (POST) — valida com Zod, força `created_by = userId`, retorna a linha inserida
- `updateAgenciamento` (POST) — patch parcial por id
- `validateAgenciamento` (POST) — só executa update se `has_role(userId,'admin')` (RPC) e seta `status='validado'`, `validado=true`, `validado_por_*`, `validado_em=now()`
- `deleteAgenciamento` (POST, admin-only)
- Mapeadores `rowToAgenciamento` / `inputToRow` (camelCase ↔ snake_case)

### 3. Refatorar `useAgenciamentos`

- Remover `useApp(...)` para agenciamentos; trocar por `useSuspenseQuery({ queryKey:['agenciamentos'], queryFn: useServerFn(listAgenciamentos) })`
- `createAgenciamento/updateAgenciamento/validateAgenciamento` viram `useMutation` que invalida `['agenciamentos']`
- Manter toda a lógica atual de filtros, summary, ranking e permissões (já está pronta e correta) — só muda a fonte dos dados
- Adicionar `loading`/`error` para a página tratar estados

### 4. Limpeza de mocks

- Remover `agenciamentos`/`addAgenciamento`/`updateAgenciamento`/`validateAgenciamento` do `useApp` (`src/store/app-store.ts`) e a importação de `agenciamentosSeed`
- Remover `agenciamentosSeed` de `src/lib/mock/data.ts` (e quaisquer helpers só usados por ele)
- Conferir que nenhum outro consumidor (dashboard, ranking global) usa o store antigo; se usar, migrar para o mesmo hook/`useQuery`

### 5. Página `/agenciamentos`

- Suspense boundary + `errorComponent` na rota
- Estado vazio já existe — manter; só ajustar copy quando não há nenhum registro vs. filtros sem resultado
- Toasts via `sonner` em criar/editar/validar (sucesso e erro)
- Botão **Validar** escondido para não-admin; botão **Drive** desabilitado com tooltip quando `drive_folder_url` vazio
- Modal: pré-seleciona `corretor_id = session.id` para corretor e bloqueia o campo; checkbox "Agenciamento validado" desabilitado para não-admin

### 6. Validação

- `bun run build` e `bun run lint`
- Teste manual via preview com Playwright em duas contas (admin + corretor) cobrindo: criar, refresh persiste, filtros, validar (admin OK / corretor bloqueado), isolamento Cordial/Morar, estado vazio, mobile

## Critérios de aceite

1. Tabela `public.agenciamentos` criada com RLS + trigger anti-escalada de validação.
2. CRUD passa por server functions autenticadas; nada de service role no client.
3. UI lê/escreve do banco; refresh mantém os dados; mocks removidos do store e do `mock/data.ts`.
4. Admin vê todos; corretor vê só os próprios/responsáveis; validação só por admin (frontend + RLS/trigger).
5. Métricas, ranking e filtros calculados sobre dados reais.
6. Build e lint passam; testes manuais documentados na resposta final.

## Fora de escopo (registrar como pendência)

- Tabelas auxiliares de histórico/anexos (`agency_history`, `agency_files`) — só se você pedir depois.
- Upload de fotos para storage interno (hoje usamos apenas links Drive/site).
