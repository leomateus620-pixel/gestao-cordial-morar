## Diagnóstico

O Supabase já está configurado para persistir sessão (`persistSession: true` + `localStorage`), então em Chrome/Edge desktop os usuários **deveriam** continuar logados por até 30 dias. Investigando o fluxo real de auth (`src/lib/auth-mock.ts` + `src/components/app-shell.tsx`), identifiquei o motivo real dos "logouts fantasmas":

**Bug:** na função `refresh()`, se o `supabase.auth.getSession()` retorna uma sessão válida mas o `loadSession()` (que busca `profiles` + `user_roles`) falha por qualquer motivo transiente — rede lenta ao abrir a aba, timeout em cold start, uma query com erro momentâneo — o código define `current = null` e marca `ready = true`. O `AppShell` então executa `if (authReady && session === null) navigate({ to: "/login" })` e joga o usuário na tela de login, **mesmo com a sessão do Supabase intacta no localStorage**. Ao "logar de novo", o Supabase apenas confirma a sessão que já existia — o problema nunca foi o token, foi o carregamento do perfil.

Somando a isso, o Safari iOS (ITP) apaga `localStorage` de sites pouco usados após 7 dias; e a duração do refresh token do Supabase precisa estar explicitamente configurada para 30 dias.

## O que vou fazer

### 1. Corrigir o "kick" indevido (`src/lib/auth-mock.ts`)
- Separar dois estados: `hasAuthSession` (Supabase tem token válido) e `profile` (dados carregados do banco).
- O `AppShell` só redireciona para `/login` quando **não há sessão do Supabase** — nunca por falha no `loadSession`.
- Se há sessão mas o profile falhou, faz retry com backoff (3 tentativas) em vez de deslogar.
- Ignora eventos `TOKEN_REFRESHED` e `INITIAL_SESSION` para não recarregar o profile a cada refresh de token (a cada ~1h ou ao focar aba).

### 2. Ajustar o guard do `AppShell` (`src/components/app-shell.tsx`)
- Passar a checar `hasAuthSession` em vez de `session` (profile). Enquanto o Supabase tiver token, o usuário permanece dentro do app; o profile é carregado em background com um skeleton se ainda não veio.

### 3. Estender e garantir a duração da sessão no Supabase Auth
- JWT (access token): 3600s (1h) — padrão, com auto-refresh.
- Refresh token: 30 dias (2.592.000s), com rotação ativada e reuse interval de 10s.
- Isso mantém o usuário logado por até 30 dias sem digitar senha, desde que abra o sistema pelo menos uma vez nesse período.

### 4. Comunicar a limitação do Safari iOS
- Adicionar um aviso discreto na tela de login para usuários de iPhone/iPad: "No Safari, adicione o sistema à Tela de Início para manter o login por mais tempo." (Safari trata PWAs instalados diferente do modo browser.)

### 5. Validação
- Login com Bianca (secretaria), fechar aba, reabrir → deve entrar direto na home.
- Simular falha transiente do `loadSession` → não deve deslogar.
- Testar em Chrome desktop e conferir com o log de auth do Supabase que não há re-login desnecessário.

## Detalhes técnicos

**Arquivos alterados:**
- `src/lib/auth-mock.ts` — refatorar `refresh()`/`ensureInitialized()`; adicionar `useHasAuthSession()` e retry no `loadSession`.
- `src/components/app-shell.tsx` — trocar `session === null` por `hasAuthSession === false` no guard; manter render normal enquanto profile carrega.
- `src/routes/login.tsx` — pequeno hint para Safari iOS.

**Configurações do backend (Supabase Auth):**
- `jwt_exp = 3600`
- `refresh_token_reuse_interval = 10`
- `refresh_token_rotation_enabled = true`
- (Refresh token TTL de 30 dias é o padrão do Supabase; nenhuma mudança adicional necessária.)

Sem mudanças de schema, RLS ou dados. Nenhum usuário existente precisa refazer nada.
