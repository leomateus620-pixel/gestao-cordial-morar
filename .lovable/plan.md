# Rastreamento de tempo de resposta (primeira abertura) — Atendimentos

## Causa raiz atual (auditada)

`src/routes/_app.atendimentos.tsx` (linhas 115–131) contém um `useEffect` que, ao carregar a rota `/atendimentos`, itera todos os atendimentos e chama `markAttendanceOpened` para cada um em que o corretor logado é o responsável e `openedAt` está nulo. Isso fecha o timer no momento em que o corretor entra na lista — antes de qualquer clique — invalidando completamente a métrica. A função RPC `mark_attendance_opened` e as colunas `opened_at`/`opened_by` na tabela `attendances` são a única infra hoje; não há tabela de atribuições, não há histórico de reatribuição, não há isolamento de visibilidade da métrica.

## O que será construído

### 1. Modelo de dados: `attendance_assignments`
Nova tabela normalizada (migration):
- `id`, `attendance_id`, `broker_id`, `assigned_by`, `assigned_at` (timestamp do servidor)
- `first_opened_at`, `first_opened_by`, `response_time_seconds`
- `status` enum: `pending_open | opened | superseded | cancelled`
- `superseded_at`, `cancelled_at`, `imobiliaria` (agency), `created_at`, `updated_at`
- Índices por `attendance_id`, `broker_id`, `status`, `assigned_at`, `first_opened_at`
- GRANTs + RLS explícita (ver §4)
- Trigger em `attendances`:
  - INSERT com `corretor_id` → cria assignment `pending_open`
  - UPDATE `corretor_id`: se antigo era `pending_open` → `superseded`; cria novo `pending_open`; se removido sem substituto → `cancelled`
  - Preserva assignments já `opened` intactos
- Trigger `updated_at`

As colunas `opened_at`/`opened_by` em `attendances` deixam de ser fonte da verdade (mantidas por retrocompatibilidade, espelhadas via trigger a partir do assignment ativo `opened`, sem quebrar código existente).

### 2. RPC canônica `mark_attendance_first_opened(_attendance_id uuid)`
SECURITY DEFINER, idempotente, dentro de uma transação:
1. `auth.uid()` obrigatório
2. Busca assignment ativo (`pending_open`) do atendimento
3. Valida que `broker_id = auth.uid()` — admin/secretária **não** fecham o timer
4. Se já `opened`, retorna sem alterar (idempotente)
5. Grava `first_opened_at = now()`, `first_opened_by = auth.uid()`, calcula `response_time_seconds`
6. Muda status para `opened`
7. Insere UM evento em `attendance_history` (`event_type = 'first_open'`, com duração no metadata)
8. Retorna o assignment

A RPC antiga `mark_attendance_opened` é substituída por esta (mesmo comportamento no schema `attendances` via trigger de espelhamento).

### 3. Frontend — corrigir gatilho
- **Remover** o `useEffect` de auto-marcação em `src/routes/_app.atendimentos.tsx` (linhas 115–131) e o `openedMarkedRef`.
- **Chamar `markAttendanceFirstOpened`** apenas dentro do `AtendimentoDetailDrawer`, em `useEffect` que dispara **após** os dados reais do atendimento estarem carregados e o drawer aberto. Guard local `useRef` para não repetir no mesmo mount; a idempotência do backend cobre o resto (StrictMode, retries, múltiplas abas).
- Nunca disparar a partir de: lista, viewport, notification center, marcar lida, `Ler tudo`, deep link (o deep link abre o drawer; é o drawer que dispara).

### 4. RLS e visibilidade
`attendance_assignments`:
- **SELECT**: admin + secretaria (todos os campos); corretor apenas suas próprias linhas **excluindo** `response_time_seconds`, `first_opened_at`, `assigned_at` do payload retornado ao cliente — feito por uma **view** `broker_assignments_safe` (sem colunas de timing) usada para consultas do corretor; a tabela crua fica bloqueada para role `corretor`.
- **INSERT/UPDATE/DELETE**: bloqueado para todos (`service_role` apenas); mutações só via RPC/triggers SECURITY DEFINER.
- **RPC `mark_attendance_first_opened`**: executável por authenticated (a própria função valida ownership).
- **RPC de agregados** (`corretores_response_metrics`): SECURITY DEFINER, retorna dados apenas se `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'secretaria')`; caso contrário retorna vazio.

### 5. Notificações — comportamento preservado
- A notificação `atendimento_atribuido` (trigger `notify_atendimento_corretor`) continua igual para o corretor: sem timer, sem duração, sem ranking.
- A notificação `atendimento_iniciado` (para admins, gerada em `mark_attendance_opened`) é migrada para dentro da nova RPC, preservando o texto atual.
- Enriquecimento para admin/secretária no `NotificationBell`/`NotificationsSpotlight`: quando `tipo = 'atendimento_atribuido'` e o usuário é admin/secretária, buscar o assignment ativo e renderizar estado pendente (`Aguardando abertura há X`) ou concluído (`Aberto em X min`). O payload da notificação em si **não** carrega os timestamps sensíveis — o enriquecimento vem de uma consulta separada autorizada por RLS/RPC.
- Corretor recebe o mesmo registro de notificação, mas o componente renderiza apenas os campos operacionais (branch por role no client + RLS no backend garante que os campos de timing nem chegam ao browser do corretor).

### 6. Timer visual ao vivo (apenas admin/secretária)
- Componente `<PendingAssignmentTimer assignedAt={...} />` calcula duração a partir do `assigned_at` persistido.
- Um único `useEffect` global com `setInterval(30_000)` + `document.visibilitychange` pause; timers derivados via context, não um interval por card.
- Formatação: `Menos de 1 min` / `X min` / `X h Y min` / `X d Y h`.

### 7. Histórico estruturado
- Novo `event_type`: `assignment_created`, `first_open`, `assignment_superseded`, `assignment_cancelled`.
- Renderização no timeline existente de `AtendimentoDetailDrawer` (visível a todos que já veem o histórico — a duração fica no metadata e é renderizada apenas para admin/secretária).

### 8. Módulo Corretores — métricas
- Nova RPC `get_corretores_response_metrics(_start, _end, _imobiliaria, _track)` retornando por corretor:
  - `avg_response_seconds`, `completed_count`, `pending_count`, `fastest_seconds`, `slowest_seconds`, `median_seconds`
- Filtros já existentes na página reutilizados.
- Novo card `Tempo médio para abertura` em `CorretorCard` / `CorretoresRanking`, renderizado apenas para admin/secretária (`useSession().role`). A RPC já bloqueia no backend.
- Exclui `superseded` nunca abertos, `cancelled`, e assignments com `first_opened_by != broker_id`.

### 9. Cache / realtime
- Query keys novas: `["attendance-assignments", attendanceId]`, `["corretores-response-metrics", filters]`.
- Após `mark_attendance_first_opened`: invalidar `["attendances"]`, `["notifications"]`, `["attendance-history", id]`, `["attendance-assignments", id]`, `["corretores-response-metrics"]`.
- Subscription realtime existente de notifications continua; adicionar canal para `attendance_assignments` (apenas para admin/secretária).

### 10. UI notification center (refinamento)
Melhorias em `NotificationBell` e `NotificationsSpotlight`:
- Hierarquia tipográfica (tipo em caps pequeno, cliente em peso semibold, timestamp em muted).
- Estado pendente/concluído com badge colorido (apenas admin/secretária).
- Largura desktop controlada (max-w-md), safe-area mobile, scroll interno estável.
- CTA `Abrir atendimento` como ação primária, `Marcar como lida` secundária.

## Detalhes técnicos

**Arquivos a criar:**
- Migration SQL (tabela + RLS + view + RPCs + triggers)
- `src/lib/attendances/assignments.functions.ts` (server fns tipadas)
- `src/hooks/useAttendanceAssignment.ts`
- `src/hooks/useCorretoresResponseMetrics.ts`
- `src/components/notifications/PendingAssignmentTimer.tsx`
- `src/lib/time/elapsed.ts` (formatação)

**Arquivos a editar:**
- `src/routes/_app.atendimentos.tsx` — remover auto-open effect
- `src/components/atendimentos/AtendimentoDetailDrawer.tsx` — disparar RPC após carregar
- `src/components/notification-bell.tsx`, `src/components/notifications/NotificationsSpotlight.tsx` — enriquecimento role-based
- `src/components/corretores/CorretorCard.tsx`, `CorretoresRanking.tsx` — card de métrica gated
- `src/lib/attendances/attendances.functions.ts` — remover/redirecionar `markAttendanceOpened` legada

**Segurança:**
- Nenhuma policy `USING (true)`, nenhum grant amplo para `anon`.
- Timing fields nunca em payload retornado ao corretor (RLS + view + branch de RPC).
- Triggers e RPCs `SECURITY DEFINER` com `search_path = public`.

**Validação:**
- Typecheck + build
- Playwright: fluxo completo Bianca cria → Ricardo recebe notificação → abre central → marca lida → entra em /atendimentos → clica no card → drawer abre → timer fecha uma única vez → refresh preserva. Admin abrindo não fecha. Reatribuição preserva histórico.
- Testes de viewport: 375, 768, 1280.

## Fora de escopo

- Não altera CRM sales/rental separation, RLS existentes de `attendances`/`clients`, integrações Google, financeiro, agenda.
- Não cria novo menu de navegação.
- Não expõe métrica ao corretor.