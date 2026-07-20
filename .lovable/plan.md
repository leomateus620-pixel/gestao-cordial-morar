## Objetivo
Liberar o menu **Agenda** para a Bianca (secretária) com poder equivalente ao admin: ver, criar, editar e excluir eventos de qualquer corretor.

## Mudanças

### 1. `src/lib/mock/permissions.ts`
- Adicionar `"agenda"` à lista `modules` do perfil `secretaria`.
- Adicionar `"agenda:read"` às permissions (já tem `agenda:write`).

### 2. Migração Supabase — RLS da agenda
Atualizar policies e funções auxiliares para reconhecer o papel `secretaria` como acesso total (equivalente a admin), sem afetar o isolamento dos corretores:

- `public.agenda_can_access(_event_id)` → incluir `OR public.has_role(auth.uid(), 'secretaria'::public.app_role)`.
- `public.agenda_can_edit(_event_id)` → mesma inclusão.
- Policy `Agenda: ver compromissos visíveis` (SELECT) → adicionar cláusula `OR has_role(auth.uid(), 'secretaria')`.
- Policy `Agenda: editar próprio ou admin` (UPDATE) → adicionar cláusula secretaria em USING e WITH CHECK.
- Policy `Agenda: excluir próprio ou admin` (DELETE) → adicionar cláusula secretaria.

As policies de participantes/checklist/reminders/guests já se apoiam em `agenda_can_access`/`agenda_can_edit`, então herdam a mudança automaticamente.

Corretores continuam vendo apenas eventos próprios (created_by / owner / participante). Admin e secretária veem tudo.

## Fora do escopo
- UI da agenda (já existe e funciona).
- Nenhuma alteração em outros módulos.
