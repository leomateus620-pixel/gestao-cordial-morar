## Objetivo
Reduzir poluição visual nos cards de Atendimentos removendo as áreas de próxima ação.

## Mudanças em `src/components/atendimentos/AtendimentoCard.tsx`
1. Remover a seção "Próxima ação" / "Retorno atrasado" (bloco com data do próximo retorno) que fica logo abaixo do cabeçalho do card. O bloco "Última ação" passa a vir direto após o cabeçalho.
2. Remover o botão "Agendar próxima ação" / "Reagendar próxima ação" no rodapé. Quando existir próxima etapa, o card continua exibindo o botão "Avançar para …"; caso contrário, o rodapé fica só com "Abrir atendimento" + WhatsApp.
3. Limpar o que ficar sem uso após a remoção: estado de agendamento de retorno, diálogo `criar-retorno` disparado por esse botão, cálculo de `overdue` e imports (`CalendarClock`, `CircleAlert`) se não forem mais usados.

## O que não muda
- Agendar retorno continua disponível dentro do drawer de detalhes do atendimento.
- Dados de próximo retorno permanecem no banco e nas demais telas; apenas deixam de ser exibidos no card.
