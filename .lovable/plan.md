## Diagnóstico

As melhorias planejadas no turno anterior (badges "Aguardando abertura há X" / "Aberto em Y" e destaque para gestão) foram implementadas no `NotificationBell`, mas nunca aparecem em tela. Verifiquei o motivo:

- `src/components/notifications/AssignmentStatusBadge.tsx` usa `MANAGEMENT_ROLES = new Set(["admin", "secretaria"])`.
- Mas os perfis reais definidos em `src/lib/mock/permissions.ts` são `"admin_owner" | "secretaria" | "corretor" | "financeiro_admin"` — não existe `"admin"`.
- Consequência: para o Leonardo (admin_owner), `isManagement` é sempre `false`, o `useQuery` fica `enabled: false`, o RPC `get_attendance_assignment_status` nunca é chamado (confirmei nas requisições de rede — só há chamadas para `listMyNotifications`/`markNotificationRead`, nenhuma para o RPC) e o badge nunca renderiza.
- Dados do backend estão corretos: a linha em `attendance_assignments` para o atendimento aberto tem `status='opened'` e `response_time_seconds=2`, então assim que o gate de role for corrigido, os selos aparecem imediatamente.

O segundo ponto ("a notificação dentro do sistema também não mudou") é o `NotificationsSpotlight`: o componente não recebeu nenhum enriquecimento com o tempo de resposta no turno anterior; hoje ele só mostra título/mensagem/hora.

## Plano

1. `src/components/notifications/AssignmentStatusBadge.tsx`
   - Trocar `MANAGEMENT_ROLES` para `new Set(["admin_owner", "secretaria", "financeiro_admin"])`, alinhando com os valores reais de `UserProfile`.
   - Nenhuma outra mudança de lógica.

2. `src/components/notifications/NotificationsSpotlight.tsx`
   - Para notificações `atendimento_atribuido` / `atendimento_iniciado` do usuário de gestão, renderizar o mesmo `AssignmentStatusBadge` logo abaixo do título, extraindo o `attendanceId` do `link` com o helper já existente `attendanceIdFromLink`.
   - Manter o badge oculto para corretores (o próprio componente já cuida disso).

3. Validação
   - `bun run tsgo` para garantir tipos.
   - Abrir o preview como admin, abrir o sino e o spotlight, confirmar visualmente:
     - Notificações `atendimento_iniciado` mostram "Aberto em Xs · <corretor>".
     - Notificações `atendimento_atribuido` ainda pendentes mostram "Aguardando abertura há Xm".
   - Conferir a aba Network para ver requisições ao RPC `getAttendanceAssignmentStatus` sendo disparadas.

## Fora de escopo

- Nenhuma mudança de RLS, migrações ou backend — o problema é 100% frontend (nome de role errado).
- Sem mudanças em `CorretoresResponseTimeCard`, RPCs, ou lógica de disparo do timer.
