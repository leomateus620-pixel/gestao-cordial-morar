## Ativar a nova Central de Notificações

A auditoria mostrou que os artefatos de código já existem no repositório, mas o backend está no estado antigo: a migration `20260728013000_notification_experience_security.sql` (1.381 linhas) nunca foi aplicada. Sem ela, o provider quebra em runtime — as RPCs `list_my_notifications`, `get_my_notification_summary`, `mark_notification_read`, `mark_all_notifications_read`, `get_notification_attendance_statuses`, `get_notification_management_summary` não existem, `public.notifications` não tem `category / read_at / imobiliaria / entity_type / entity_id / assignment_id / actor_id / dedup_key`, as tabelas `public.user_agencies` e `public.email_dispatch_claims` não existem e `public.notifications` ainda está em `pg_publication_tables` para `supabase_realtime` (o modelo novo é 100% Broadcast privado).

Também falta um segredo de servidor exigido pelos webhooks de cron (`NOTIFICATION_HOOK_SECRET`).

### O que será feito

1. **Aplicar a migration `20260728013000_notification_experience_security.sql`** exatamente como está no repositório. Ela é idempotente e cobre:
   - novos campos, índices e constraints em `public.notifications`;
   - backfill de `category`, `entity_type`, `entity_id`, `imobiliaria`, `assignment_id`, `read_at`;
   - criação de `public.user_agencies` (autorização de imobiliária, fail-closed) e `public.email_dispatch_claims` (idempotência do envio de e-mail);
   - remoção de `public.notifications` da publicação `supabase_realtime` (o cliente novo consome só Broadcast privado no tópico `notifications:<auth.uid()>`, com payload contendo apenas `notification_id`);
   - políticas de RLS `TO authenticated` bloqueando leitura/escrita direta em `notifications` — todo acesso passa pelas RPCs `SECURITY DEFINER`;
   - RPCs de inbox, marcação de leitura, status de atendimento e resumo gerencial, todas com escopo por papel (corretor / secretaria / admin / financeiro) e por imobiliária autorizada em `user_agencies`;
   - trigger/função que emite o Broadcast privado só com `notification_id`.

2. **Provisionar vínculos iniciais em `public.user_agencies`** para os usuários operacionais atuais, seguindo o runbook `docs/notification-experience-release.md`:
   - admins/secretaria com acesso a `cordial` e `morar`;
   - corretores conforme a imobiliária em que já operam (derivada de `attendances.imobiliaria` recentes por `created_by` / `corretor_id`).
   Sem esse passo, atribuições passam a falhar fechadas (comportamento correto, mas quebraria o fluxo atual).

3. **Cadastrar `NOTIFICATION_HOOK_SECRET`** como secret de servidor (gerado, 48 chars) — usado por `src/routes/api/public/hooks/agenda-reminders.ts` e `sale-payment-reminders.ts` para validar o cron. Não reutiliza a chave publicável. `ALLOW_NOTIFICATION_HOOK_FORCE` **não** será definido (fica ausente em produção, como o runbook exige).

4. **Atualizar as chamadas de cron** (agenda-reminders e sale-payment-reminders no `pg_cron`) para enviar `NOTIFICATION_HOOK_SECRET` no header `apikey`, substituindo a chave publicável usada hoje.

5. **Validação pós-deploy** (sem simulação; itens que exigirem login real ficam registrados):
   - `psql` confirmando novas colunas, tabelas, RPCs e ausência de `notifications` em `pg_publication_tables`;
   - build + typecheck do app;
   - smoke autenticado por papel conforme runbook — quando não houver sessão disponível no sandbox, o item é registrado como bloqueado, não simulado.

### Fora de escopo

- Alterar UI/UX das notificações, provider, sino, spotlight, toasts ou e-mails (os arquivos já estão prontos e a auditoria não pediu mudança).
- Alterar regras de atribuição, tempo de resposta, permissões ou pipeline.
- Reescrever a migration `20260728013000` — ela é aplicada como está.
- Adicionar novas migrations que não sejam estritamente aditivas para gaps encontrados após a validação.

Aprovando, aplico a migration, provisiono `user_agencies`, gero o segredo, ajusto os cron jobs e rodo a validação.