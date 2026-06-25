## Bug

No `AgenciamentoFormModal`, clicar em **X / Cancelar / Esc / fundo** não fecha mais o modal. O motivo está em dois `useEffect` que se cancelam:

1. `requestClose()` faz `setClosing(true)` e, depois de 170ms, chama `onOpenChange(false)`.
2. O pai (`_app.agenciamentos.tsx`) seta `formOpen = false`, então o modal recebe `open = false`.
3. O effect que desmonta o modal (linha 154) só roda quando `!open && mounted && !closing` — mas `closing` já é `true`, então o `setTimeout` para `setMounted(false)` **nunca dispara** e o overlay permanece visível na tela travado em estado "closing".

Resultado: o modal fica preso após qualquer tentativa de fechar.

## Correção

Arquivo único: `src/components/agenciamentos/AgenciamentoFormModal.tsx`.

1. Em `requestClose()`, além de chamar `onOpenChange(false)` no fim do timeout, chamar também `setMounted(false)` para garantir a desmontagem mesmo quando o effect externo é bloqueado pelo guard de `closing`.
2. Ajustar o effect de desmontagem (linha 154) para remover o `&& !closing` do guard — passa a ser `if (!open && mounted)` —, com proteção idempotente (não reagendar se já estiver em closing/timer ativo via `useRef`), para que o fechamento externo (ex.: após salvar com sucesso) continue funcionando.
3. Mesmo ajuste no fluxo de `handleSubmit` em sucesso: o `setClosing(true) + setTimeout(onOpenChange(false), 170)` passa a também chamar `setMounted(false)` no mesmo timeout (reaproveitar `requestClose` ou extrair `closeNow()`).

Sem mudanças em props, layout, estilos, validação, ou no pai. O contrato `onOpenChange` continua igual.

## Validação manual

1. Abrir o modal → clicar no **X** → modal fecha imediatamente, sem travar.
2. Abrir → clicar em **Cancelar** → fecha.
3. Abrir → pressionar **Esc** → fecha.
4. Abrir → clicar no fundo escuro → fecha.
5. Abrir → preencher dados válidos → **Cadastrar agenciamento** → modal fecha sozinho após salvar e toast aparece.
6. Reabrir após cada fluxo acima → o formulário aparece zerado, sem resquício de overlay.
