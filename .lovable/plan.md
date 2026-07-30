## Objetivo

Corrigir a sobreposição visual dos campos do bloco "Próximo passo" no formulário de novo atendimento e fazer com que, ao preencher esse bloco, o sistema crie automaticamente um evento na Agenda (que já sincroniza com o Google Agenda do responsável).

## 1. Correção de layout (UI)

Em `src/components/atendimentos/AtendimentoFormModal.tsx`, bloco "Próximo passo":

- Hoje "Próximo retorno" (data + hora lado a lado) e "Tipo de próximo passo" dividem uma grade de 2 colunas; em larguras médias o campo de hora invade/encosta no select.
- Passar a estrutura para: **Data** e **Hora** em uma linha própria (duas colunas de largura igual, sem `w-28` fixo), e **Tipo de próximo passo** ocupando a linha inteira abaixo.
- Garantir `min-w-0` nos campos para o input de hora não estourar o container, e manter a nota "Horário opcional — usamos 09:00".

## 2. Evento automático na agenda

Regra: ao salvar um novo atendimento **com data de próximo retorno preenchida**, criar um evento de agenda vinculado.

- Após `createAttendance` retornar (no wrapper de criação usado pela página de Atendimentos), se `proximoRetorno` existir, chamar `upsertAgendaEvent` com:
  - `titulo`: "<Tipo do próximo passo> — <nome do cliente>" (ex.: "Agendar visita — João Silva"); sem tipo definido, "Retorno — <cliente>".
  - `tipo`: mapeado do próximo passo (`agendar_visita` → `visita`; `ligar_cliente`/`enviar_whatsapp`/`enviar_opcoes`/`aguardar_cliente`/`encaminhar_corretor` → `retorno`; `fazer_proposta` → `reuniao`; demais → `retorno`).
  - `inicio`: o ISO do próximo retorno; `fim`: +30 min (padrão para retorno) ou +60 min para visita.
  - `imobiliaria`, `clienteNome`, `atendimentoId`, `imovelId`/`imovelDescricao` do atendimento.
  - `responsavelPrincipalId`/`Nome`: corretor vinculado; se "A definir", o próprio usuário que criou.
  - `descricao`/`observacoes`: telefone do contato + observações internas do atendimento.
  - `status: "agendado"`, `prioridade` herdada do atendimento, `googleCalendarSyncStatus: "nao_sincronizado"`.
- A sincronização com o Google Agenda usa o fluxo automático já existente (fila/pg_cron do módulo Agenda) — nenhum código novo de Google é necessário; o evento entra na fila como qualquer outro criado pela Agenda.
- Feedback ao usuário: toast informando "Atendimento salvo e retorno agendado na agenda"; falha na criação do evento não bloqueia o atendimento (toast de aviso apenas).
- Invalida as queries da Agenda para o evento aparecer imediatamente.

## Detalhes técnicos

- Arquivos: `AtendimentoFormModal.tsx` (layout), `src/routes/_app.atendimentos.tsx` (handler `createAtendimento`) e/ou `src/components/sheets/novo-atendimento.tsx` para o atalho do dashboard, reaproveitando `upsertAgendaEvent` de `src/lib/agenda/agenda.functions.ts` e `AGENDA_QUERY_KEY`.
- Sem alterações de banco de dados ou RLS: a criação de eventos já é permitida ao usuário autenticado e o vínculo `atendimentoId` já existe em `agenda_events`.
- Evitar duplicidade: o evento é criado apenas na criação do atendimento (não na edição), como já ocorre com o fluxo "Agendar visita" do drawer.
