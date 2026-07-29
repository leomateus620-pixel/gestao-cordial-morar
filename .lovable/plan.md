## Objetivo

Permitir excluir eventos no menu **Agenda** e vendas no menu **Vendas**, com confirmação, feedback e — na Agenda — remoção automática do evento no Google Agenda.

## O que já existe (verificado)

- `softDeleteAgendaEvent` (marca `deleted_at` + status `cancelado`) e o hook `useAgenda().deleteEvent` já existem, mas **nenhum botão na UI** chama isso.
- A sincronização com o Google já trata exclusão: quando o evento está cancelado/excluído, a fila envia `DELETE` para o Google Calendar de cada destinatário conectado (com retry). Ou seja, "apagou no sistema → apaga no Google" já funciona no backend.
- `deleteSale` (remove venda + arquivos anexos do storage) já existe em `sales.functions.ts` e é exposto por `useSales()`, mas também **sem botão na UI**.
- As regras de acesso no banco já permitem exclusão pelo criador/responsável e por admin (Agenda e Vendas).

Conclusão: o trabalho é essencialmente de interface + confirmação + integração dos fluxos existentes.

## Mudanças

### 1. Agenda
- Adicionar ação **Excluir** no modal de detalhes/edição do evento (`AgendaFormModal`), visível apenas para quem pode editar aquele evento.
- Adicionar ação rápida de exclusão no card do evento (`AgendaEventCard`, menu de três pontinhos), também condicionada à permissão.
- Diálogo de confirmação (AlertDialog) avisando que o evento também será removido do Google Agenda dos participantes.
- Após confirmar: chama `deleteEvent`, fecha o modal, invalida as listas, mostra toast de sucesso/erro com a mensagem real do banco.

### 2. Vendas
- Adicionar ação **Excluir venda** no `SaleDetailsDrawer` e no menu do `SaleRecordCard`.
- Diálogo de confirmação informando que anexos e parcelas de comissão também serão removidos.
- Após confirmar: chama `deleteSale`, fecha o drawer, atualiza lista e KPIs, toast de resultado.
- Exibir a ação apenas para o corretor dono da venda ou admin, alinhado às regras já existentes no banco.

### 3. Robustez do "apaga no Google"
- Garantir que, ao excluir na Agenda, a sincronização seja disparada mesmo se a limpeza local falhar parcialmente, e que registros de sincronização do evento sejam limpos após a remoção no Google.

## Validação

- Criar um evento de teste com Google conectado, excluir e confirmar que sai da lista do sistema e do Google Agenda (verificando o registro de sincronização e a fila).
- Excluir uma venda de teste e confirmar remoção da lista, dos KPIs e dos anexos.
- Conferir que um corretor não consegue excluir evento/venda de outro (erro tratado, sem tela quebrada).

## Detalhes técnicos

Arquivos afetados: `src/components/agenda/AgendaFormModal.tsx`, `AgendaEventCard.tsx`, `AgendaTimeline.tsx`, `src/routes/_app.agenda.index.tsx`, `_app.agenda.fotos.tsx`, `src/components/vendas/SaleDetailsDrawer.tsx`, `SaleRecordCard.tsx`, `src/routes/_app.vendas.tsx`, e ajustes pontuais em `src/lib/agenda/agenda.functions.ts` / `google.server.ts`. Sem novas tabelas ou migrações.
