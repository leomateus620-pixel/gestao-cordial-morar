# Notificações visuais + e-mail no fluxo de atendimentos

Hoje o fluxo já existe (trigger `notify_atendimento_corretor` + RPC `mark_attendance_opened`), mas o feedback aparece **apenas** no sino da Central de notificações. Vamos torná-lo visível assim que o usuário entra no sistema, e enviar um e-mail inteligente ao corretor quando um lead for atribuído.

## O que muda para o usuário

1. **Corretor** — ao ser vinculado a um atendimento:
   - Notificação visual em destaque ao abrir o sistema (toast/banner "Novo atendimento recebido").
   - E-mail automático com dados do cliente e CTA "Abrir atendimento".
   - O sino continua funcionando como histórico.
2. **Admin** — ao entrar no sistema recebe destaque visual quando:
   - Bianca (ou qualquer usuário) vincular um lead a um corretor.
   - O corretor abrir/iniciar o atendimento (indicador do tempo de resposta).
3. Nada muda para a Bianca além do que já existe.

## Componentes de UI

- **`NotificationsSpotlight`** (novo): banner premium exibido no topo do `_app.tsx` ao entrar no sistema, agrupando notificações não lidas dos últimos 24h por tipo (`atendimento_atribuido`, `atendimento_iniciado`). Mostra até 3 cards com nome do cliente/corretor, tempo decorrido e ações "Abrir" / "Marcar como lida". Fecha suavemente ao dispensar; reaparece apenas quando surgirem novas notificações (persistência em `localStorage` com hash das ids vistas).
- **Toast em tempo real**: assinatura Supabase Realtime em `notifications` (filtrado por `user_id = auth.uid()`); ao receber uma linha nova, dispara `sonner` com CTA de navegação e som/pulso sutil. Substitui a experiência "só no sino".
- **Badge do sino**: mantém contagem, mas ganha pulso quando existir notificação de alta prioridade recém-chegada.
- Segmentação visual por tipo (accent laranja para atribuição, verde para iniciado, teal neutro para os demais).

## Backend / banco

Migração nova:

1. `notifications.tipo` recebe valores canônicos `atendimento_atribuido` e `atendimento_iniciado` (padroniza o que o trigger já grava; ajustar `notify_atendimento_corretor` e `mark_attendance_opened` para usar esses códigos + campo `link` para `/atendimentos?focus=<id>`).
2. `notifications.metadata jsonb` (se não existir) para guardar `attendance_id`, `cliente_nome`, `assigned_at`, `opened_at`.
3. Índice `(user_id, lida, created_at desc)` para o spotlight.
4. RLS já existente (SELECT/UPDATE `user_id = auth.uid()`) permanece; garantir GRANT.
5. Habilitar `REPLICA IDENTITY FULL` + publicação `supabase_realtime` para `public.notifications` para o toast em tempo real.

## E-mail ao corretor

- Novo template React Email `assignment-to-broker.tsx` em `src/lib/email-templates/`, registrado em `registry.ts`.
- Conteúdo: saudação com nome do corretor, resumo do lead (cliente, telefone, imobiliária, finalidade, região, orçamento), CTA "Abrir atendimento" apontando para a URL pública do app (`/atendimentos?focus=<id>`), rodapé neutro. `Body` `#ffffff`, brand chips Cordial/Morar em accent.
- Server function `sendAssignmentEmail` em `src/lib/attendances/email.functions.ts`:
  - Autenticada (`requireSupabaseAuth`).
  - Idempotente via `email_logs` (`email_type = attendance_assignment`, chave `attendance_id + corretor_id`).
  - Busca perfil do corretor (`profiles.email`) e dados do atendimento; ignora se corretor sem e-mail.
  - Enfileira via `/lovable/email/transactional/send` (infra já existente).
- Disparo:
  - **Client-side**: `NovoAtendimentoSheet` e `AtendimentoFormModal` (edição) chamam `sendAssignmentEmail` sempre que `corretorId` mudar/for definido, no mesmo padrão fire-and-forget do `sendFirstAttendanceEmail`. Toasts informam sucesso/erro.
  - Se no futuro quisermos garantia server-side, dá para adicionar um edge trigger; nesta iteração fica no client (mesmo padrão vigente) para manter simplicidade e RLS clara.

## Testes / validação

- Login Bianca → cria atendimento vinculando Pablo → validar:
  - Toast + spotlight no navegador do Pablo (Realtime).
  - E-mail recebido em `pablo.backes@hotmail.com` (checar `email_logs`).
  - Admins veem spotlight `atendimento_atribuido` ao entrar.
- Pablo abre o card → RPC dispara `atendimento_iniciado`; admins recebem spotlight + toast.
- Reabrir o app: notificações já lidas não geram spotlight novamente (hash persistido).
- Verificar que corretor sem e-mail resulta em `email_logs.status = skipped` sem quebrar UI.

## Detalhes técnicos

- **Arquivos novos**:
  - `src/components/notifications/NotificationsSpotlight.tsx`
  - `src/hooks/useRealtimeNotifications.ts`
  - `src/lib/email-templates/assignment-to-broker.tsx`
  - migração SQL para tipos/índice/realtime.
- **Arquivos alterados**:
  - `src/routes/_app.tsx` (montar spotlight + hook realtime).
  - `src/components/notification-bell.tsx` (pulso alta prioridade, dedupe com spotlight).
  - `src/lib/attendances/email.functions.ts` (nova função + tipos).
  - `src/lib/email-templates/registry.ts` (registrar template).
  - `src/components/sheets/novo-atendimento.tsx` e `src/components/atendimentos/AtendimentoFormModal.tsx` (disparar e-mail de atribuição).
  - Trigger SQL `notify_atendimento_corretor` e RPC `mark_attendance_opened` para padronizar `tipo`/`link`/`metadata` (sem quebrar chamadas atuais).
- **Sem** mudanças no design principal do menu Atendimentos além do spotlight global e do toast.
- Respeita permissões: spotlight só considera notificações do próprio `user_id`; admins recebem via linhas próprias já criadas pelo trigger/RPC.

Ao aprovar, implemento em uma única leva (migração + template + UI + wiring) e valido o fluxo ponta-a-ponta.
