## Situação

O erro anterior de RLS foi corrigido: as políticas atuais de `agenda_events` (UPDATE/DELETE) já liberam criador, responsável, participante, admin e secretária, e todos os usuários possuem vínculo em `user_agencies`. Portanto, **a causa do erro que continua aparecendo ainda não está confirmada** — o print mostra apenas o overlay genérico "The app encountered an error", sem mensagem específica, e não há registro do erro nos logs do servidor (só aparecem chamadas 401 do cron `/api/public/hooks/agenda-reminders`, um problema separado).

Por isso o primeiro passo do trabalho é reproduzir e capturar o erro real, e só depois corrigir.

## Passos

1. **Reproduzir com navegador automatizado**
   - Abrir `/agenda`, editar um compromisso existente e acionar Excluir → Confirmar.
   - Capturar console, stack trace e a resposta da server function `softDeleteAgendaEvent`.

2. **Corrigir a causa identificada**
   Candidatos já mapeados na leitura do código, a confirmar na reprodução:
   - `softDeleteAgendaEvent` faz `update(...).eq("id", id)` sem `.select()`: se a linha for bloqueada, nada é excluído e nenhum erro claro aparece.
   - A exclusão no Google roda dentro do mesmo request (`scheduleGoogleSync`); falha de token/permissão pode estourar antes do retorno.
   - Possível erro de estado no `AgendaFormModal` após a exclusão (modal fechando com dados já removidos do cache).

3. **Tornar o fluxo à prova de falha**
   - Retornar erro explícito quando a exclusão não afetar nenhuma linha ("Você não tem permissão para excluir este compromisso").
   - Isolar a remoção no Google Agenda: se ela falhar, o compromisso ainda é excluído no sistema e a sincronização fica na fila (`agenda_google_sync_queue`) para nova tentativa automática.
   - Exibir mensagem de erro legível no próprio modal em vez do overlay genérico.

4. **Validar**
   - Repetir a exclusão pelo navegador com usuário admin e com corretor participante.
   - Conferir no banco que `deleted_at`/`status = cancelado` foram gravados e que a fila de sincronização foi processada ou reagendada.

## Detalhes técnicos

Arquivos envolvidos: `src/lib/agenda/agenda.functions.ts` (`softDeleteAgendaEvent`), `src/lib/google-calendar/google.server.ts` (`scheduleGoogleSync` / `syncSingleRecipient`), `src/components/agenda/AgendaFormModal.tsx` (handler de exclusão) e `src/hooks/useAgenda.ts` (mutation `remove`). Sem alteração de esquema prevista; migração só se a reprodução mostrar bloqueio de política.
