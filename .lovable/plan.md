## Objetivo
Remover o botão "Abrir atendimento" do card e tornar o próprio card clicável, com o WhatsApp em destaque no rodapé.

## Mudanças em `src/components/atendimentos/AtendimentoCard.tsx`
1. Remover o botão "Abrir atendimento" do rodapé.
2. WhatsApp vira ação em destaque: botão largura total, verde sólido, com ícone + texto "Falar no WhatsApp". Quando o telefone for inválido, exibe o mesmo bloco desabilitado com aviso.
3. Card inteiro abre o atendimento:
   - `<article>` recebe `onClick` chamando `onOpen`, além de `role="button"`, `tabIndex={0}` e `onKeyDown` (Enter/Espaço) para acessibilidade, mais `cursor-pointer` e realce no hover/focus.
   - Impedir a abertura nas áreas interativas: o `select` de etapa, o botão "Avançar para …" e o link do WhatsApp param a propagação do clique (`event.stopPropagation()`).
4. Ajustar o rodapé para o novo layout (WhatsApp em cima, "Avançar para …" abaixo) mantendo espaçamentos consistentes.

## O que não muda
- Drawer de detalhes, dados e permissões permanecem iguais; só muda a forma de abrir.
- Seletor de etapa e avanço de etapa continuam funcionando normalmente.
