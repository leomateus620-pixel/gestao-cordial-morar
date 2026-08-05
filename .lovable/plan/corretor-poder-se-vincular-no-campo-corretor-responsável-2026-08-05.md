# Corretor poder se vincular no campo "Corretor responsável"

## O que está acontecendo (verificado)

O campo só mostra "A definir" para corretores porque a rotina que carrega a lista de corretores (`list_assignable_brokers`) devolve lista vazia quando quem chama não é admin ou secretária. Além disso, a regra de segurança do banco (gatilho `enforce_attendance_assignment_scope`) bloqueia qualquer vínculo de corretor feito por quem não é administração — então, mesmo que a lista aparecesse, o salvamento daria erro.

Na edição acontece o mesmo: o campo fica vazio e o painel de vínculo é liberado apenas para admin/secretária.

## Correção proposta

Permitir **autovínculo**: o corretor pode selecionar apenas a si mesmo (não outros corretores). Admin e secretária continuam podendo vincular qualquer corretor.

1. Lista de corretores: quando quem consulta é corretor, retornar somente o próprio registro (respeitando as imobiliárias às quais ele pertence).
2. Regra do banco: liberar a atribuição quando o corretor escolhido for o próprio usuário logado, mantendo as validações de imobiliária e de perfil ativo. Trocar para outro corretor continua exclusivo da administração.
3. Interface: mostrar o próprio nome como opção (ex.: "Felipe (você)") no cadastro e na edição, e liberar o campo de vínculo para o corretor nesses dois lugares — sem abrir os demais controles de administração.

## Detalhes técnicos

- Migração: atualizar `public.list_assignable_brokers` (branch para `corretor`: filtrar `p.id = auth.uid()`) e `public.enforce_attendance_assignment_scope` (permitir quando `v_target = auth.uid()`).
- `src/lib/access-control.ts`: novo helper `canSelfAssignAttendance` / ajuste de uso, mantendo `canManageAttendanceAssignments` para as ações de administração.
- `src/components/atendimentos/AtendimentoFormModal.tsx` e `AtendimentoDetailDrawer.tsx` / `AtendimentoActionsDialog.tsx`: habilitar o seletor quando houver opção própria disponível e marcar "(você)".
- Sem mudança no fluxo de e-mail: autovínculo não dispara e-mail de repasse para si mesmo.

## Validação

- Testes de `access-control` e `broker-scope` atualizados.
- Preview: criar atendimento como corretor selecionando o próprio nome; editar um atendimento existente e vincular a si mesmo; conferir que corretor não vê/atribui outros corretores e que admin/secretária seguem com a lista completa.
