## Objetivo

Substituir o login mock (`localStorage`) por autenticação real e persistente via Lovable Cloud, com perfis e papéis por usuário e RLS estrita.

## 1. Infraestrutura — Lovable Cloud

- Ativar Lovable Cloud (gera banco, auth e clientes Supabase do projeto).
- Garantir `LOVABLE_API_KEY` (auto-provisionado).

## 2. Banco de dados (migrações)

**Enum de papéis**

```sql
create type public.app_role as enum ('admin','secretaria','corretor','financeiro');
```

**Tabela `profiles`** (1:1 com `auth.users`)

- `id uuid pk references auth.users on delete cascade`
- `nome text not null`, `email text not null`, `cargo text`, `iniciais text`
- `created_at`, `updated_at`
- GRANTs: `authenticated` SELECT/INSERT/UPDATE; `service_role` ALL.
- RLS:
  - `select`: `auth.uid() = id OR has_role(auth.uid(),'admin')`
  - `update`: `auth.uid() = id OR has_role(auth.uid(),'admin')`
  - `insert`: `auth.uid() = id` (trigger cuida da criação automática)

**Tabela `user_roles`**

- `id uuid pk`, `user_id uuid references auth.users on delete cascade`, `role app_role`, `unique(user_id,role)`
- GRANTs: `authenticated` SELECT; `service_role` ALL.
- RLS:
  - `select`: `auth.uid() = user_id OR has_role(auth.uid(),'admin')`
  - `insert/update/delete`: somente admin (`has_role(auth.uid(),'admin')`)

**Função `public.has_role`** — `security definer`, `set search_path=public`, sem recursão.

**Trigger `handle_new_user`** (`security definer`) em `auth.users after insert`:
- cria `profiles` a partir de `raw_user_meta_data.nome` (fallback: parte antes do `@` do e-mail), iniciais geradas automaticamente
- insere `user_roles (user_id, 'corretor')` por padrão
- **Exceção**: se for o primeiro usuário do sistema (count = 0), insere como `admin` → garante que você fica admin no primeiro cadastro.

## 3. Frontend

**Remover mock**
- Apagar `src/lib/auth-mock.ts` (e usos diretos de `mockUsers`).
- Substituir `useSession()` por um novo hook `useSession()` em `src/lib/auth.ts` que ouve `supabase.auth.onAuthStateChange` (defer com `setTimeout` para evitar deadlock) e expõe `{ user, profile, roles, perfil, perfilLabel, modules, permissions }`. Mapeamento de `role → modules/permissions` permanece em `src/lib/mock/permissions.ts` (renomear conceitualmente, manter arquivo).
- `PermissionGuard` continua igual, lendo do novo `useSession`.

**Tela `/login`** (`src/routes/login.tsx`)
- Abas/toggle: **Entrar** | **Criar conta** | link **Esqueci a senha**.
- Validação Zod (e-mail válido, senha ≥ 8).
- Entrar: `supabase.auth.signInWithPassword`.
- Criar conta: `supabase.auth.signUp` com `emailRedirectTo: window.location.origin` e `data: { nome }`. Mensagem clara após cadastro.
- Esqueci a senha: `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`.
- Manter visual atual (painel branding + form claro).
- Remover comentário com usuários demo.

**Nova rota pública `/reset-password`** (`src/routes/reset-password.tsx`)
- Detecta `type=recovery` no hash, chama `supabase.auth.updateUser({ password })`, redireciona para `/`.

**Root** (`src/routes/__root.tsx`)
- Registrar `supabase.auth.onAuthStateChange` uma única vez (filtrar `SIGNED_IN/SIGNED_OUT/USER_UPDATED`, `router.invalidate()` + `queryClient.invalidateQueries()` exceto no SIGNED_OUT) — conforme guia.

**Layout autenticado**
- Garantir que rotas internas exijam sessão. Como o projeto já usa `_app.*` no top-level, adicionar `beforeLoad` com check via `supabase.auth.getUser()` (client-only — usar `ssr: false` no layout `_app.tsx` para evitar redirect-loop, já que sessão é client-side).
- Redirect → `/login` quando não houver sessão.

**Logout**
- Botão existente passa a chamar `supabase.auth.signOut()` + limpar query cache + `navigate('/login', { replace: true })`.

## 4. Segurança

- RLS habilitada em `profiles` e `user_roles`.
- Papel **nunca** vive em `profiles` — somente em `user_roles` (previne escalada).
- `has_role` é `security definer` para evitar recursão.
- Senhas armazenadas pelo Supabase Auth (não tocamos). Habilitar HIBP password check.
- Nenhum dado mock de credenciais permanece no código.

## 5. Configuração de Auth

- **Auto-confirm de e-mail: ligado** (para o usuário conseguir entrar sem caixa de entrada configurada; recomenda-se desligar quando email domain for configurado depois).
- HIBP password check: ligado.

## 6. Limpeza

- Excluir `src/lib/auth-mock.ts`.
- Remover qualquer referência a `mockUsers` / senhas demo.
- Atualizar imports em todos os componentes que usam `useSession` para o novo módulo.

## Detalhes técnicos (resumo p/ revisão)

| Item | Arquivo |
|---|---|
| Migração SQL | nova migration |
| Trigger 1º usuário=admin | função `handle_new_user` |
| Hook de sessão | `src/lib/auth.ts` (novo) |
| Login real | `src/routes/login.tsx` |
| Reset senha | `src/routes/reset-password.tsx` (novo) |
| Listener auth | `src/routes/__root.tsx` |
| Gate de rotas | `src/routes/_app.tsx` (`ssr: false` + `beforeLoad`) |
| Remover mock | delete `src/lib/auth-mock.ts` |

Após aprovação, implemento tudo em sequência: ativar Cloud → migração → frontend → limpeza.
