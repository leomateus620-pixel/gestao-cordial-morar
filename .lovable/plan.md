## Objetivo
Limpar todos os atendimentos de teste atualmente cadastrados no banco, para iniciar o uso real do módulo com a lista zerada.

## Ação
- Executar um `DELETE` em `public.attendances` removendo 100% dos registros existentes.
- Nenhuma alteração de schema, RLS, código ou UI. Estrutura, políticas e fluxos permanecem intactos.

## Impacto
- O menu "Atendimentos" passa a exibir lista vazia imediatamente após execução.
- Novos atendimentos criados pelos corretores/admins serão os primeiros registros reais.
- Ação irreversível — os atendimentos atuais serão perdidos (confirmado como dados de teste).

## Fora de escopo
- Não zerar clientes, agenciamentos, vendas, aluguéis ou financeiro.
- Não alterar seeds nem mocks (já removidos anteriormente).
