## Objetivo
Liberar o menu **Agenda** para corretores, mantendo isolamento total (cada corretor vê apenas os próprios eventos) e garantindo que o admin veja a agenda consolidada de toda a equipe, com identificação clara de qual corretor é dono de cada compromisso.

## Situação atual (verificada)
- **RLS de `agenda_events` já cobre a regra**: SELECT permite ver o evento apenas se o usuário for `created_by`, `owner_user_id`, participante, ou admin. Nada muda no banco.
- **Bloqueio é só no frontend**: `roleDefinitions.corretor.modules` não inclui `"agenda"` e não tem `"agenda:read"`, então o item some da sidebar/rota e `RequireModuleAccess` barra o acesso direto.
- `AgendaEventCard` já mostra o responsável (`event.responsavelPrincipalNome`) via ícone `CalendarRange`, e `AgendaFilters` já tem filtro por responsável — ou seja, admin já consegue distinguir de quem é cada evento. Só falta destacar visualmente.

## Mudanças

### 1. Permissões (`src/lib/mock/permissions.ts`)
- Corretor: adicionar `"agenda"` em `modules` e `"agenda:read"` em `permissions` (mantendo `"agenda:write"` que já existe).
- Secretaria: sem mudança (segue sem o menu na navegação, como está hoje).

### 2. Identificação visual do dono (admins) — `src/components/agenda/AgendaEventCard.tsx`
- Adicionar um chip "Corretor: <nome> · <iniciais>" no rodapé do card, renderizado apenas para admins (via `useSession` + `isAdminUser`) para destacar de quem é o evento sem poluir a visão do próprio corretor.
- Fonte do nome: `event.responsavelPrincipalNome` (fallback `criadoPorNome`).

### 3. Nada muda em:
- RLS / migrações (regra já correta).
- `useAgenda`, `listAgendaEvents`, `AgendaFilters` (filtro por responsável já existe e continua útil para o admin).
- Navegação/sidebar/mobile — já são geradas a partir de `roleDefinitions`, então o item passa a aparecer automaticamente ao liberar o módulo.

## Validação
- Login como corretor (Felipe): menu "Agenda" aparece, lista apenas eventos onde ele é dono/participante, não vê nada dos outros.
- Login como admin: continua vendo todos os eventos, agora com chip "Corretor: <nome>" em cada card.
- Login como secretária: menu continua oculto (permissão `agenda:write` interna preservada para fluxos operacionais).

## Detalhes técnicos
- Sem migração SQL: as policies existentes em `agenda_events`, `agenda_event_participants`, `agenda_event_checklist`, `agenda_event_reminders`, `agenda_event_guests` já isolam por `agenda_can_access`.
- Sem novo endpoint: `listAgendaEvents` já roda com `requireSupabaseAuth` e retorna somente o que a RLS libera.
