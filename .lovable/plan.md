# Excluir atendimento pela tela de edição

Adicionar uma ação de exclusão dentro do modal "Editar atendimento", com confirmação clara e remoção real no banco.

## Como vai funcionar

- No rodapé do modal de edição (apenas em edição, nunca em "Novo atendimento") aparece um botão discreto "Excluir atendimento", separado das ações de salvar.
- Ao clicar, abre uma confirmação mostrando o nome do cliente e avisando que o histórico, os vínculos de corretor e os registros de notificação daquele atendimento também serão removidos. A ação só ocorre após confirmar.
- Enquanto exclui, os botões ficam bloqueados para evitar clique duplo. Ao concluir: modal fecha, lista/kanban atualizam na hora e aparece um aviso de sucesso. Em caso de erro, o modal continua aberto com a mensagem do erro.
- Quem pode excluir: administradores e quem criou o atendimento (é o que as regras de segurança do banco já permitem). Para os demais, o botão não é exibido — evitando um erro de permissão.

## Detalhes técnicos

- Reutiliza o que já existe: `deleteAttendance` em `src/lib/attendances/attendances.functions.ts` (com `requireSupabaseAuth`) e `removeAtendimento` já exposto por `src/hooks/useAttendances.ts`. Nenhuma rota, função ou tabela nova.
- Política RLS de DELETE já existente: mesma imobiliária E (`created_by = auth.uid()` OU papel admin). Nenhuma migração necessária.
- Exclusões em cascata já configuradas para `attendance_history`, `attendance_assignments` e `email_logs`, então não fica dado órfão.
- `AtendimentoFormModal.tsx`: novas props opcionais `onDelete` e `canDelete`; estado local `confirmDeleteOpen` + `deleting`; confirmação com `AlertDialog` (padrão já usado no modal de agenciamentos).
- `src/routes/_app.atendimentos.tsx`: passa `onDelete` (chama `removeAtendimento`, fecha `editId`, toast) e calcula `canDelete` com a sessão atual (admin ou criador), usando um helper novo em `src/lib/access-control.ts` (`canDeleteAttendance`).
- O drawer de detalhes continua igual; a exclusão fica só no fluxo de edição, como pedido.

## Testes e validação

- Teste unitário para `canDeleteAttendance` (admin, criador, corretor não-criador, secretária não-criadora) na suíte existente.
- Typecheck + suíte completa de testes.
- Validação no preview: abrir a edição de um atendimento, excluir, confirmar que sai da lista e não retorna após recarregar; conferir no banco que o registro e o histórico ligado sumiram.
