## Objetivo

Remover a lista fictícia de corretores (`corretoresSeed`) e passar a exibir, em todos os menus que dependem dela, os usuários reais cadastrados no banco com papel `corretor` (e opcionalmente `admin`, que também atua como corretor). Sem quebrar fluxos existentes.

## Onde os corretores mockados aparecem hoje

Origem única: `useApp((s) => s.corretores)`, inicializado a partir de `corretoresSeed` em `src/lib/mock/data.ts` (Marcos Lima, etc.).

Consumidores diretos:
- Dashboard `/` (`_app.index.tsx`) — cards "Corretores no período" e "Top 3 corretores" via `useCorretores`.
- Página `/corretores` (`_app.corretores.tsx`) — lista, ranking, sumário, drawer.
- Página `/relatorios` — passa `corretores` ao `ReportsPage`.
- Página `/configuracoes` — KPI "Equipe" com contagem.
- Página `/agenciamentos` — filtros e formulário (seletor de corretor).
- Página `/agenda` — chip de filtro por corretor + formulário.
- Página `/vendas` — seletor `agents` no formulário.
- Página `/contratos/:id` — nome/CRECI do corretor.
- Sheets `novo-compromisso` — seletor.

## Solução

### 1. Nova fonte de dados (server function)

Criar `src/lib/corretores/corretores.functions.ts` com `listCorretores` (`createServerFn` + `requireSupabaseAuth`) que retorna todos os `profiles` cujo `user_roles.role IN ('corretor','admin')`, mapeados para o tipo `Corretor`:

- `id, nome, iniciais, creci` (usar `profiles.creci` se existir; caso contrário string vazia).
- `imobiliaria`: default `"cordial"` (ou coluna futura em `profiles.imobiliaria` se existir).
- `status`: `"ativo"`.
- Todas as métricas numéricas (`atendimentosMes`, `contratosFechados`, `comissaoPrevista`, etc.) começam em `0`. Elas são enriquecidas em runtime por:
  - `applyAgenciamentoStatsToCorretores` (já existente) — preenche números de agenciamentos a partir da tabela real.
  - Novo enriquecimento leve em `useCorretores` que soma, a partir de `attendances` (via query já disponível no projeto), `atendimentosRecebidos`, `atendimentosEmAndamento` e `contratosFechados` (status `fechado`). Vendas/aluguéis/comissão permanecem em 0 até haver dado real — sem inventar valor.

### 2. Store: parar de semear corretores

- Em `src/store/app-store.ts`:
  - `corretores: []` como estado inicial (remover uso de `corretoresSeed`/`normalizedCorretoresSeed` para o array inicial; manter apenas para a normalização dos seeds legados de `atendimentos`/`agenda` OU trocar por `[]` também, já que esses seeds não são exibidos pelas rotas gate-adas — validar durante implementação).
  - `merge` do `persist`: se `persisted.corretores` estiver vazio, aceitar array vazio (sem cair no seed).
- Em `src/lib/mock/data.ts`: transformar `corretoresSeed` em `[]` (mantém o export para não quebrar imports que persistam) e remover os objetos fictícios.

### 3. Hidratação a partir do banco

Criar hook `useHydrateCorretores` (usa `useQuery` chamando `listCorretores` via `useServerFn`) e montá-lo em `src/routes/_app.tsx`. No `onSuccess`/`useEffect`, chamar `useApp.setState({ corretores })`. Assim todos os consumidores existentes (`useApp((s) => s.corretores)`) passam a ver os corretores reais sem alterações locais.

Comportamento:
- Enquanto carrega: array vazio (as telas já lidam com "sem corretores").
- Após carregar: lista real (Felipe, Pablo e novos que forem cadastrados).

### 4. Ajustes pontuais nos consumidores

- `useCorretores`: substituir mocks de métricas por enriquecimento com dados reais (attendances query já usada no projeto). Sem mudar assinatura pública do hook.
- Onde há fallback `corretores[0]?.id` (ex.: `novo-compromisso`), permitir estado vazio ("Selecione um corretor") em vez de assumir índice 0.
- `_app.index.tsx`: card "Top 3 corretores" continua ordenando por `contratosFechados` real; se todos zerados, ranking exibe corretores por ordem alfabética (comportamento aceitável — sem dados fictícios).

### 5. Sem mudança em admin/permissões

- Regras de acesso permanecem (`RequireModuleAccess`, `hasPermission`). Nenhuma alteração em rotas, sidebar ou guardas.
- Página `/corretores` continua restrita a `admin_owner`; passará a listar os corretores reais.

## Arquivos afetados (previsão)

- Novos: `src/lib/corretores/corretores.functions.ts`, `src/hooks/useHydrateCorretores.ts`.
- Editados: `src/store/app-store.ts`, `src/lib/mock/data.ts` (esvaziar seed), `src/routes/_app.tsx` (montar hook), `src/hooks/useCorretores.ts` (enriquecimento por dados reais), `src/components/sheets/novo-compromisso.tsx` (fallback vazio).

## Fora de escopo

- Não altera schema do banco. Se `creci`/`imobiliaria` por corretor forem necessários, ficam como próximo passo (hoje o campo é opcional na UI).
- Não mexe em vendas/aluguéis/comissões calculadas — permanecerão em 0 até haver dados reais registrados (que é o comportamento correto ao remover mocks).
