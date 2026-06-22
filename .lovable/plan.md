# Plano — Agenda como módulo real (Supabase + RLS + UX refinada)

Escopo restrito ao módulo Agenda. Outras áreas (clientes, imóveis, corretores etc.) continuam usando o store atual e seus dados de demonstração — não serão tocadas.

## 1. Auditoria (resumo)

- UI: `src/routes/_app.agenda.tsx`, `src/components/agenda/*` (CreateCard, Filters, SummaryCards, Timeline, EventCard, FormModal de ~1.1k linhas com 5 etapas).
- Estado: hoje tudo vive em Zustand (`src/store/app-store.ts`) com `agendaEvents` semeados via `agendaSeed` em `src/lib/mock/data.ts` + persistência em `localStorage`.
- Lógica: `src/hooks/useAgenda.ts` (filtros, métricas), `src/services/agenda.ts` (normalização, validação, permissão local baseada em `useSession`).
- Tipos: `src/types/agenda.ts` (AgendaEvent, participantes, checklist, lembretes, status, prioridade, tipos, imobiliária, recorrência).
- Auth real já está ativa (profiles + user_roles + has_role).

Dados mock a remover do fluxo Agenda: `agendaSeed`, `mockUsers` injetados no seletor de pessoas, fallback de "Bianca", normalização contra `clientes/corretores/imoveis` semeados. Esses datasets só sobrevivem para os outros módulos; a Agenda passa a ler exclusivamente do banco.

## 2. Banco de dados (migration)

Tabelas em `public`, com GRANTs e RLS:

- `agenda_events`
  - `id uuid pk`, `created_by uuid` (auth.users), `owner_user_id uuid` (responsável principal),
  - `imobiliaria text check in ('cordial','morar','ambas')`,
  - `tipo`, `status`, `prioridade` (enums Postgres `agenda_tipo`, `agenda_status`, `agenda_prioridade`),
  - `titulo`, `descricao`, `observacoes`,
  - `inicio timestamptz not null`, `fim timestamptz`, `duracao_min int`, `dia_inteiro bool`, `repeticao text`,
  - `cliente_id`, `cliente_nome`, `atendimento_id`, `imovel_id`, `imovel_descricao`, `local`, `video_call_url` (todos texto/uuid livres — sem FK para não acoplar aos mocks),
  - `google_calendar_sync_status text default 'nao_sincronizado'` (informativo apenas),
  - `concluido_em timestamptz`, `deleted_at timestamptz`,
  - `created_at`, `updated_at` + trigger `touch_updated_at`.
- `agenda_event_participants` (`event_id`, `user_id`, `nome`, `papel`).
- `agenda_event_checklist` (`event_id`, `label`, `done`, `sort_order`).
- `agenda_event_reminders` (`event_id`, `tipo`, `antecedencia_min`, `ativo`, `canal_futuro`).

RLS (todas as quatro tabelas, escopo por usuário; admin enxerga tudo via `has_role`):

- SELECT em `agenda_events`: `deleted_at IS NULL AND (created_by = auth.uid() OR owner_user_id = auth.uid() OR EXISTS(participant where user_id = auth.uid()) OR has_role(auth.uid(),'admin'))`.
- INSERT: `created_by = auth.uid()`.
- UPDATE/DELETE (soft): `created_by = auth.uid() OR owner_user_id = auth.uid() OR has_role(auth.uid(),'admin')`.
- Tabelas filhas espelham via função `security definer` `agenda_can_access(event_id)` para evitar recursão e checar acesso ao pai.

GRANTs `SELECT/INSERT/UPDATE/DELETE` para `authenticated`, `ALL` para `service_role`, sem `anon`.

Sem seed em produção. Multiempresa = `imobiliaria` (campo já existente no domínio) — não criamos `tenant_id` novo porque o projeto não tem essa abstração; admin vê tudo, demais veem o que lhes pertence.

## 3. Camada de dados no front

Nova pasta `src/features/agenda/`:

- `types.ts` — tipos derivados das tabelas + mapeadores DB↔domínio (reusa `AgendaEvent` atual).
- `agenda.functions.ts` — `createServerFn` com `requireSupabaseAuth` para: `listAgendaEvents(filters)`, `getAgendaEvent(id)`, `createAgendaEvent(input)`, `updateAgendaEvent(id, input)`, `softDeleteAgendaEvent(id)`, `completeAgendaEvent(id)`. Cada um faz a transação (evento + participantes + checklist + lembretes) via `context.supabase`, deixando a RLS validar.
- `queries.ts` — `queryOptions` (chave `['agenda', userId, filters]`) com `useSuspenseQuery` no componente; `mutations.ts` com `useMutation` invalidando a chave.
- `permissions.ts` — `canEditEvent(event, session)`, `canViewTeam(session)` (admin/secretaria).
- `date-utils.ts` — helpers de intervalo, timezone America/Sao_Paulo, cálculo de duração ↔ fim.

Remover do Zustand: `agendaEvents`, `addCompromisso` (do fluxo Agenda), `upsertAgendaEvent`, normalização e import de `agendaSeed`. Outros módulos continuam intocados.

## 4. UI — Página `/agenda`

- Carregamento via loader `_app.agenda.tsx` chamando `ensureQueryData` da lista do usuário; `errorComponent` + `notFoundComponent`.
- `Suspense` + skeleton durante fetch; empty state quando lista vazia; banner de erro com retry (`router.invalidate()`).
- `AgendaSummaryCards`: stats calculadas no servidor (uma RPC `agenda_metrics()` ou agregação client a partir do array já carregado — usaremos client por simplicidade, sobre dados já filtrados por RLS).
- `AgendaFilters`: combobox de responsável usa lista real (`profiles` via server fn `listAgendaPeople`); cliente/imóvel mantém opções do store existente (fora do escopo do refino).
- `AgendaTimeline`: agrupa por dia, ordena por `inicio`, mostra status e ações (editar/concluir/cancelar) respeitando `canEditEvent`.
- Permissão "Agenda da equipe" só visível para admin/secretaria; usuário comum vê apenas a própria agenda (criados/owner/participante).

## 5. Modal `AgendaFormModal` — refino de UX

Manter as 5 etapas atuais, mas:

- Campos condicionais por tipo (visita → cliente+imóvel+checklist visita; fotos/vídeo → imóvel+checklist mídia; retorno → cliente+atendimento+lembrete; assinatura → cliente+local+checklist docs).
- Duração padrão por tipo (visita 60, fotos 90, vídeo 120, retorno 30, assinatura 60, reunião 60).
- Título sugerido auto (`<Tipo> — <Cliente|Imóvel>`) com edição manual.
- "Dia inteiro" oculta horário e zera duração.
- Sync bidirecional início/fim/duração.
- Footer sticky com botão Salvar sempre visível, scroll interno suave, melhor densidade no mobile (etapas viram seções colapsáveis < md).
- Mutations: fechar modal só após sucesso; toast de feedback; mantém form preenchido em erro.
- Bloco "Google Agenda" continua informativo (`google_calendar_sync_status` salvo, sem chamada externa).

## 6. Validações

Zod em `agenda.functions.ts` (cliente e servidor):

- `tipo`, `inicio` obrigatórios; `titulo` obrigatório (gerado se vazio).
- `fim > inicio` quando ambos presentes; `duracao_min > 0`.
- `responsavel_principal_id` obrigatório (default = `auth.uid()`).
- Timezone America/Sao_Paulo na exibição; persistência em UTC (`timestamptz`).

## 7. Estados de tela

Skeleton, empty, erro+retry, saving, deleting, sem permissão, "nenhum resultado nos filtros". Toasts via sonner já existente.

## 8. Testes / validação

- `bun run build` + lint (typecheck via build).
- Playwright headless: login userA → cria visita → reload → persiste; cria com checklist → reabre; cria com participante userB → loga como userB → vê o evento; userC sem vínculo → não vê; filtros hoje/7d/mês; editar; cancelar (soft delete some da lista, métrica cai); mobile viewport.

## 9. Entregáveis

- 1 migration SQL com enums, 4 tabelas, GRANTs, RLS, função `agenda_can_access`, trigger `updated_at`.
- `src/features/agenda/*` (types, functions, queries, mutations, permissions, date-utils).
- Refatoração de `useAgenda`, `_app.agenda.tsx`, `AgendaFormModal`, `AgendaFilters`, `AgendaSummaryCards`, `AgendaTimeline`, `AgendaEventCard`.
- Limpeza no `app-store` (remoção do estado de agenda) e em `useApp` consumido por componentes Agenda.
- Resumo técnico ao final: arquivos, migration, fluxos testados.

## Fora do escopo

- Integração real Google Calendar.
- Refatorar clientes/imóveis/corretores para Supabase (continuam com store/mocks atuais; Agenda passa a guardar apenas `*_id`/nome livre).
- Notificações por e-mail/WhatsApp (persistência da intenção apenas).
