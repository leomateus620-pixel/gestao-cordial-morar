## Validação PR #16 — Atendimentos

### O que está OK (validado por leitura do código)

- Rota `/atendimentos` registrada via `createFileRoute`, `head()` com title.
- Sem FAB antigo no menu Atendimentos (`Fab` não é importado em `_app.atendimentos.tsx`); botão único = `AtendimentoCreateCard`.
- Card "Novo atendimento" acima da lista, com gradiente teal + chips + 3D (`perspective + rotateX` em `.atendimento-create-card`) + microinteração no ícone de seta.
- Animação Dynamic Island: keyframes `atendimento-form-island-in/out` (390ms in / 170ms out, cubic-bezier), `transform-origin` ajustado por viewport, fechamento controlado por `requestClose()` com timer + cleanup.
- Formulário em 4 blocos (`Entrada`, `Interesse`, `Operação`, `Próximo passo`) com grid 2-col no desktop, mobile full-screen `h-dvh`, footer com `pb-[max(0.75rem,env(safe-area-inset-bottom))]`.
- Validações cobrem: nome, telefone (≥10 dígitos), origem, imobiliária, finalidade, tipo, status, prioridade, e-mail formato, orçamento min ≤ max, `motivoPerda` obrigatório quando `perdido`, e auto-sugestão de `agendar_visita` quando status = `visita_agendada`. Corretor `a_definir` não bloqueia salvamento.
- Conversão em cliente: AlertDialog com explicação, dedupe por nome/telefone, marca `convertidoEmCliente` + `clienteConvertidoId`, badge "Cliente" no card.
- Filtros: status (chips), finalidade, tipo, origem, corretor, prioridade, período, busca, agência (Todas/Cordial/Morar), botão "Limpar" funcional.
- Summary cards: 9 status (clicáveis para filtrar) + 4 insights (Compra/Aluguel/Ticket médio/Leads do mês), com scroll horizontal mobile e grid 9-col desktop.
- Hooks/serviços bem separados (`useAtendimentos`, `services/atendimentos.ts`, `types/atendimento.ts`), persistência local com normalização legacy em `app-store.ts`.
- `NovoAtendimentoSheet` (wrapper de compat usado pelo dashboard) aponta para o novo modal — sem duplicidade.

### Ajustes pontuais a aplicar

1. **`AtendimentoCreateCard.tsx` — conflito de transform quando o modal abre**
   - O classe Tailwind `scale-[0.985]` (aplicada via `isOpen`) sobrescreve o `transform: perspective(...)` definido em `.atendimento-create-card` no `styles.css`, causando "salto" visual ao abrir.
   - Trocar a indicação visual de aberto por `opacity` + `pointer-events-none` apenas, removendo `scale-[0.985]`. Mantém suavidade e respeita a transform 3D.

2. **`AtendimentoFormModal.tsx` — fundo opaco no mobile e foco inicial**
   - O `form` usa `bg-background` (opaco) — bom para mobile, mas no desktop o painel perde a sensação glass. Adicionar `sm:bg-background/96 sm:backdrop-blur-xl` para alinhar ao padrão do Clientes.
   - Adicionar `autoFocus` no primeiro `input` relevante (nome do contato) quando `open` transiciona para true, para acelerar entrada de dados.
   - Após salvar, resetar `setForm(initialForm)` **antes** de `requestClose()` já está OK; garantir que `saving` volte a `false` mesmo em early-return (já está síncrono, OK).

3. **`AtendimentoFilters.tsx` — clamp do botão "Limpar filtros" e overflow do chip-bar**
   - Quando `showFilters` está oculto no mobile, "Limpar filtros" fica escondido. Mover o botão "Limpar" para ficar visível ao lado do toggle de filtros quando houver `activeSecondary > 0`, OU adicionar um chip "Limpar" inline na barra de status quando existirem filtros secundários ativos.
   - `atendimentoBrokerOptions.slice(0, -1)` no select de corretor assume que o último item é `a_definir`; trocar por `.filter((b) => b.id !== "a_definir")` para robustez se a ordem mudar.

4. **`AtendimentoSummaryCards.tsx` — UX do clique repetido**
   - Hoje clicar duas vezes no mesmo status mantém o filtro ativo. Permitir alternar: se já está ativo, voltar para `todos`. Pequena mudança em `onClick` para enviar `active ? "todos" : item.status` (precisa relaxar o tipo no handler para `AtendimentoStatus | "todos"`).

5. **`_app.atendimentos.tsx` — toast persistente sob o modal**
   - O feedback usa `z-[70]` e o modal `z-50`. OK para visibilidade, mas o toast aparece sobre o header do modal quando se cria atendimento. Disparar o `setFeedback` dentro de `setTimeout(..., 220)` após `requestClose` (ou após o modal desmontar) para o toast surgir já com a lista visível.

6. **`AtendimentoCard.tsx` — ação "Marcar motivo de perda"**
   - Botão sempre habilitado, mas só faz sentido quando `status !== "perdido"`. Esconder a ação quando o atendimento já estiver `perdido` (para evitar mock action sem contexto). Demais ações secundárias permanecem como mock com feedback visual.

7. **CSS — afinar fechamento no mobile**
   - `.atendimento-form-modal--closing` usa 170ms; no mobile com `transform-origin: 50% 100%` o ease-in atual deixa o flick visível. Reduzir para 150ms no breakpoint `max-width: 640px` e suavizar `cubic-bezier(0.32, 0, 0.67, 0)`.

8. **Regressões fora de Atendimentos**
   - Rápida varredura: `_app.index.tsx` ainda importa `NovoAtendimentoSheet` (OK), `_app.clientes.$clienteId.tsx`, `_app.imoveis.$imovelId.tsx`, `_app.relatorios.tsx`, `_app.vendas.tsx` continuam compilando (sem mudança de assinatura nos types). Não há ação corretiva pendente — apenas validar com Playwright após o build para garantir que nenhuma rota retorne branco.

### Validação final

Após aplicar 1–7, rodar Playwright headless em `localhost:8080`:
- abrir `/atendimentos`, screenshot;
- clicar no card "Novo atendimento", screenshot do modal (entrada);
- tentar submit vazio (espera erros), preencher mínimo, salvar, validar toast + novo card na lista;
- alternar Cordial/Morar/Todas;
- clicar em um chip de status do summary para filtrar e clicar de novo para desfazer;
- mobile viewport 390x844: validar `h-dvh`, footer acessível, chips com scroll, card de criação visível sem rolagem;
- navegar `/`, `/clientes`, `/agenda`, `/imoveis`, `/relatorios`, `/vendas` — checar console por erros.

### Arquivos a alterar

- `src/components/atendimentos/AtendimentoCreateCard.tsx`
- `src/components/atendimentos/AtendimentoFormModal.tsx`
- `src/components/atendimentos/AtendimentoFilters.tsx`
- `src/components/atendimentos/AtendimentoSummaryCards.tsx`
- `src/components/atendimentos/AtendimentoCard.tsx`
- `src/routes/_app.atendimentos.tsx`
- `src/styles.css`

Nenhuma alteração em store, services, types ou rotas fora de Atendimentos. Sem banco real, sem refactor estrutural.
