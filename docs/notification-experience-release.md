# Central de notificações — runbook de release

## Ordem de implantação

1. Aplicar `supabase/migrations/20260728013000_notification_experience_security.sql`.
2. Conferir os vínculos em `public.user_agencies`. Papéis globais de gestão já existentes preservam acesso às duas operações; os demais vínculos vêm de evidência operacional. Usuários novos ou sem evidência ficam bloqueados até o provisionamento explícito por um administrador.
3. Definir `NOTIFICATION_HOOK_SECRET` somente no ambiente do servidor e no chamador do cron. Não reutilizar a chave publicável do Supabase.
4. Atualizar os cron jobs de agenda e vendas para enviar esse segredo em `apikey` ou `x-api-key`.
5. Confirmar que `public.notifications` não está em `pg_publication_tables` para `supabase_realtime` e que o Realtime privado permite somente o tópico `notifications:<auth.uid()>`; o evento transmite apenas `notification_id` e o cliente busca o payload autorizado pela RPC.
6. Publicar a aplicação somente depois dos testes por papel abaixo.

Qualquer campo de override manual fica bloqueado em produção. Em desenvolvimento, targeting e `force` exigem `ALLOW_NOTIFICATION_HOOK_FORCE=true`, e um target manual só é aceito com `force=true`.

## Provisionamento de imobiliária

O vínculo é uma autorização persistida, não uma preferência visual. Um administrador pode provisionar um usuário elegível com:

```sql
insert into public.user_agencies (user_id, agency, source)
values ('00000000-0000-0000-0000-000000000000', 'cordial', 'admin')
on conflict (user_id, agency) do nothing;
```

Valores de `agency`: `cordial` ou `morar`. A atribuição de atendimento falha de forma fechada quando o ator ou o destinatário não tem vínculo com a imobiliária, ou quando o destinatário não tem papel operacional elegível (`corretor` ou `admin`). Todo cadastro novo precisa desse provisionamento antes de operar.

## Smoke obrigatório

- Corretor: recebe apenas notificações próprias e autorizadas; não recebe campos `opened_at`, `opened_by`, `response_time_seconds`, média ou mediana em REST, realtime, histórico ou retorno da RPC de primeira abertura.
- Secretaria: vê somente métricas das imobiliárias autorizadas e consegue selecionar apenas corretores elegíveis.
- Administrador: recebe o alerta de primeira abertura, vê resumo gerencial real e consegue paginar/marcar notificações.
- Financeiro: recebe alertas financeiros permitidos, mas nenhuma métrica de tempo de atendimento.
- Todos: CTA abre a entidade real; destino removido ou sem permissão apresenta estado indisponível sem revelar dados.
- Realtime: um usuário não consegue assinar o tópico de outro usuário; o payload do Broadcast não contém título, mensagem, entidade, horário nem métrica.
- Concorrência: duas entregas com a mesma `dedup_key` resultam em uma única notificação.
- E-mail: acompanhar `email_dispatch_claims`; uma claim `failed` só pode ser removida para retry depois de confirmar que a mensagem não entrou na fila, evitando duplicidade por falha ambígua.
- Vínculo imutável: o tempo exibido corresponde ao `assignment_id` gravado na notificação, sem trocar para a atribuição mais recente do atendimento.
- Responsivo: verificar 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 e 1920 px, com teclado e `prefers-reduced-motion`.

## Consultas de verificação

```sql
select tipo, category, count(*)
from public.notifications
group by tipo, category
order by tipo;

select role, count(*)
from public.user_roles
group by role;

select agency, count(*)
from public.user_agencies
group by agency;

select source, status, count(*)
from public.email_dispatch_claims
group by source, status;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'notifications';
```

Não concluir o release se a última consulta retornar linha, se houver usuário operacional sem vínculo ou com vínculo mais amplo que o autorizado, cron usando chave pública, política privada de Realtime ausente, migration pendente ou smoke autenticado por papel incompleto.
