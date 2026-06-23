## Problema

A função `sendFirstAttendanceEmail` (disparada ao salvar um atendimento) usa o cliente Supabase autenticado do usuário, que respeita RLS. A tabela `public.email_logs` foi criada com RLS ligado mas:

- só tem política de **SELECT** (`Owners and admins can read email logs`);
- não tem `GRANT` explícito para `authenticated`;
- não tem políticas de `INSERT` nem `UPDATE`.

Resultado: o primeiro `insert` em `email_logs` (status `pending`) falha por RLS, a função retorna `failed` e o e-mail nunca é enfileirado. Nenhuma linha aparece em `email_logs`, e `email_send_log` só registra o teste manual.

## Correção

Criar uma migration que:

1. `GRANT SELECT, INSERT, UPDATE ON public.email_logs TO authenticated;` e `GRANT ALL ... TO service_role;`
2. Adiciona políticas:
   - `INSERT` para `authenticated` com `WITH CHECK (created_by = auth.uid())`.
   - `UPDATE` para `authenticated` com `USING (created_by = auth.uid())` e mesmo `WITH CHECK` (necessário para o `update` final que marca `status='sent'`/`failed`).
   - Mantém a SELECT atual.
   - `service_role` continua ignorando RLS (já tem bypass).

Isso é suficiente porque `sendFirstAttendanceEmail` sempre grava `created_by = userId` e atualiza só o próprio log pelo `id`.

## Validação

1. Cadastrar um novo atendimento de teste pelo preview com e-mail real.
2. Conferir `email_logs` (deve aparecer linha `pending` → `sent`) e `email_send_log` (linha `sent` para `first-attendance-thank-you`).
3. Conferir caixa de entrada / spam do destinatário.
4. Se algum atendimento anterior (Camila, Ricardo, Leonardo Streoschein) deva receber o e-mail retroativo, disparo manualmente via `sendFirstAttendanceEmail` por `attendanceId` — confirmar com você antes.

## Arquivos

- Nova migration `supabase/migrations/<timestamp>_email_logs_rls.sql` com os GRANTs e políticas acima.
- Nenhuma mudança em código de aplicação.

## Limitações

- Não altero o template nem o conteúdo do e-mail.
- Não mexo nas tabelas de infra de e-mail (`email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`).
