# Agenda: só horário de início + aviso no celular 1 hora antes

## O que muda para quem usa

1. **Passo 2 (Data e horário)** passa a pedir apenas **Data** e **Hora de início**. O campo "Fim" some da tela. O sistema continua guardando uma duração padrão de 1 hora nos bastidores, para o compromisso aparecer certo na linha do tempo e no Google Agenda.
2. **Cada compromisso fica ligado a quem o criou** (já é gravado hoje) e essa pessoa passa a receber, de forma garantida, o **aviso no celular 1 hora antes** do horário de início — inclusive nas sessões da Agenda de fotos.
3. Quem for marcado como responsável ou participante continua recebendo o mesmo aviso.

## O problema que isso corrige

Hoje o cadastro do compromisso envia uma lista de lembretes vazia ao salvar, e isso **apaga os lembretes automáticos** (1 dia, 1 hora e 30 minutos antes) que o sistema tinha criado. Resultado: muitos compromissos ficam sem nenhum aviso. O disparo de avisos, o envio para o celular e o agendamento a cada minuto já existem e funcionam — o que falta é o lembrete de 1 hora sobreviver ao salvamento.

## Detalhes técnicos

- `src/components/agenda/AgendaFormModal.tsx`
  - remover o campo "Fim" e o estado `horaFim`, o erro `errors.fim` e a validação associada;
  - texto do passo 2 passa a "Informe a data e a hora de início"; o fim é calculado como início + 60 min ao montar o `AgendaEventInput` (mantendo `duracaoMin: 60`), sem alterar o tipo `AgendaEventInput`.
- `src/services/agenda.ts` — ajustar `validateAgendaEvent` para não exigir/validar hora de fim quando ela é derivada.
- `src/lib/agenda/agenda.functions.ts` (`upsertAgendaEvent`)
  - depois de recriar os filhos, **garantir sempre** os lembretes internos padrão quando a entrada vier vazia: 1440, 60 e 30 minutos, com `ativo = true`;
  - garantir que o lembrete de **60 min** exista mesmo quando a entrada trouxer outros lembretes (dedupe por `antecedencia_min`);
  - continuar gravando `created_by` na criação (já existe) e não sobrescrevê-lo na edição.
- Sem mudança de schema, RLS, serializers Cordial/Morar, Drive ou fila de publicação. O worker `/api/public/hooks/agenda-reminders` (cron a cada minuto) já inclui `created_by`, `owner_user_id` e participantes como destinatários; o gatilho `notifications_enqueue_push` já empurra para `push-worker`.

## Verificação

- Criar um compromisso de teste com início daqui a ~61 minutos e conferir no banco que os lembretes de 1440/60/30 existem; editar o compromisso e conferir que continuam existindo.
- Rodar o disparo em modo forçado no preview para o lembrete de 60 min e confirmar a notificação no sino e o envio ao celular do criador (se ele tiver o push ativado no sino → Preferências).
- Checar que quem cria o evento está vinculado a uma imobiliária em `user_agencies` — o dispatcher filtra destinatários por esse vínculo; se faltar, o aviso é descartado.
