## Auditoria técnica — Nova Central de Notificações

Todos os 7 artefatos exigidos estão presentes no repositório (componentes, libs, migration `20260728013000` e doc de release). Ambiente sincronizado — auditoria pode prosseguir.

Esta é uma auditoria **read-only**: nenhum commit, PR, deploy, migration nova ou atualização de pacote será executado sem aprovação explícita adicional. Se algum passo exigir sessão autenticada real que não esteja disponível no sandbox, o item será registrado como "bloqueado", não simulado.

### Escopo por seção

1. **Dependências JS** — inspeção de `package.json`, lockfile e `node_modules/*/package.json` para React 19, TanStack Router/Start/Query, `@supabase/supabase-js` (verificar `realtime.setAuth`, canais `config.private`, Broadcast privado — requer ≥ 2.45), Radix Dialog/Sheet/Switch, lucide-react, sonner, zod, @react-email/components, Tailwind v4. Sem update em massa; só flag de incompatibilidade com versão atual × mínima × risco.

2. **Validação limpa** — rodar em sequência: install reproduzível, `npm run typecheck`, `npm test` (esperado 13 OK), `eslint` restrito aos arquivos da experiência, `npm run build`. Registrar stdout resumido. Sem regenerar `routeTree.gen.ts`.

3. **Dependências de banco** — via `supabase--read_query` inspecionar existência/tipos de: `notifications`, `attendances`, `attendance_assignments`, `attendance_history`, `agenda_events(+participants,+reminders)`, `real_estate_sales`, `sale_payments`, `sale_commission_installments`, `profiles`, `user_roles`, `has_role`, `_try_uuid`, enums `app_role`/`attendance_assignment_status`, disponibilidade de `realtime.messages`, `realtime.topic()`, `realtime.send()`. Ler o SQL da migration 20260728013000 e cruzar cada dependência. Nenhuma migration aplicada será alterada; qualquer gap gera migration **aditiva idempotente proposta**, não aplicada.

4. **Realtime & segurança** — checar: `notifications` fora de `pg_publication_tables` para `supabase_realtime`; nome de canal `notifications:<auth.uid()>`; RLS de `realtime.messages` bloqueando cross-user; payload Broadcast contém somente `notification_id` (grep no provider); RPCs autenticadas devolvem payload completo; `notifications` sem SELECT/INSERT/UPDATE direto para `authenticated`; particionamento de cache React Query por `user.id`.

5. **Papéis e imobiliárias** — validar `public.user_agencies` (existência, RLS fail-closed), e para cada papel (`corretor`, `secretaria`, `admin`, `financeiro`, sem vínculo) verificar via leitura de policies/funções que `opened_at`, `opened_by`, `first_opened_at`, `response_time_seconds`, médias/medianas não vazam. Testes por sessão real ficam **bloqueados** se não houver login disponível.

6. **Variáveis e serviços** — checar presença (nunca valores) de `SUPABASE_URL`, publishable/anon, `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_HOOK_SECRET`, envs de e-mail, crons agenda/vendas. Confirmar guarda `ALLOW_NOTIFICATION_HOOK_FORCE` só fora de produção e que `NOTIFICATION_HOOK_SECRET ≠ publishable`.

7. **Integração da app** — grep para garantir exatamente 1 `NotificationExperienceProvider`, 1 subscription Realtime, 1 Center, 1 TransientRegion; ausência de imports de `src/lib/mock/notifications.ts`, `NotificationsSpotlight`, `AssignmentStatusBadge`, fallbacks. Validar CTAs em allowlist e que aberturas de Atendimento/Agenda/Venda usam IDs vindos do backend.

8. **Compatibilidade / acessibilidade** — revisar `notification-sound.ts` (AudioContext gated em interação), uso de `crypto.subtle`, `prefers-reduced-motion`, foco/teclado/close do Sheet no `NotificationCenter`, tap targets ≥44px, animações via transform/opacity, limite de 2 toasts.

### Entregável final

Matriz por item (dependência • versão/objeto • status OK/incompatível/ausente/não-verificável • evidência • impacto • correção mínima) seguida de:
- comandos executados + resultados resumidos;
- deps propostas alterar (se houver) com justificativa;
- envs ausentes (sem valores);
- pré-requisitos da migration 20260728013000;
- bloqueios (ex.: sessão autenticada indisponível);
- decisão **GO / NO-GO** e gates obrigatórios de deploy.

### Fora de escopo
Alterações em migrations já aplicadas, atualização em massa de dependências, mudanças em regras de notificação/atendimento/permissões/atribuição/tempo de resposta, commits, PRs, deploy.

Aprovando este plano, executo a auditoria e devolvo o relatório completo.