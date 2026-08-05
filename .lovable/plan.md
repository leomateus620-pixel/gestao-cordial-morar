# Reprovar agenciamento com motivo

## O que muda

No painel do admin, ao lado de "Validar" passa a existir a ação **Reprovar** (somente admin/gestão). Ao clicar, abre um diálogo com um campo obrigatório de descrição: o motivo da reprovação.

- Aprovado: fluxo atual, agenciamento vira "Validado".
- Reprovado: o agenciamento fica com status **Reprovado**, guarda o motivo, quem reprovou e quando.

## O que o corretor vê

No menu Agenciamentos, os agenciamentos reprovados aparecem destacados:
- selo vermelho "Reprovado" no card e no painel de detalhe;
- bloco com o motivo escrito pelo admin, quem reprovou e a data;
- aviso no topo da lista quando o corretor tem agenciamentos reprovados aguardando correção;
- filtro de status ganha a opção "Reprovado".

Ao corrigir e salvar o agenciamento, ele volta para "Em andamento" (sai da reprovação) e pode ser validado novamente pelo admin. O motivo anterior fica registrado no histórico do registro.

Agenciamento reprovado não conta para bonificação enquanto estiver nesse estado.

## Detalhes técnicos

1. **Migração**: em `public.agenciamentos`, adicionar `reprovado_motivo text`, `reprovado_por_id uuid`, `reprovado_por_nome text`, `reprovado_em timestamptz`; incluir `'reprovado'` no domínio de status usado pela coluna `status` (constraint/enum conforme definição atual).
2. **Tipos** (`src/types/agenciamento.ts`): novo `AgenciamentoStatus` `"reprovado"` + opção no `agenciamentoStatusOptions` e no `AgenciamentoStatusFilter`; campos `reprovadoMotivo`, `reprovadoPorNome`, `reprovadoEm` em `Agenciamento`.
3. **Server** (`agenciamentos.server.ts`): mapear as novas colunas em `rowToAgenciamento`; ao aplicar patch de edição por corretor, limpar campos de reprovação e voltar status para `em_andamento` quando o registro estava reprovado.
4. **Server fn** (`agenciamentos.functions.ts`): novo `rejectAgenciamentoFn` (`{ id, motivo, reprovadoPorNome }`), com validação do motivo (3–500 chars) e checagem de perfil admin; grava status `reprovado`, zera `validado`/`validado_em`. `validateAgenciamentoFn` passa a limpar os campos de reprovação.
5. **Hook** (`useAgenciamentos.ts`): expor `rejectAgenciamento` (mutation + invalidação) e `canReject` (apenas `admin_owner`).
6. **UI**: novo `AgenciamentoRejectDialog.tsx` (textarea + confirmação); botão "Reprovar" em `AgenciamentoCard.tsx` e `AgenciamentoDetailDrawer.tsx` visível só para admin; bloco de motivo no card/detalhe para todos; banner de pendência em `_app.agenciamentos.tsx`; opção no `AgenciamentoFilters.tsx` e badge em `status-badge`/labels de status.
7. **Bonificação**: `isCountableAgenciamento` (`track.ts`) e a função SQL `agenciamento_bonus_recalc` passam a excluir status `reprovado`.
8. **Testes**: casos em `reclassify.test.ts`/novo teste cobrindo validação do motivo, transição reprovado → em_andamento na edição e exclusão da bonificação.
