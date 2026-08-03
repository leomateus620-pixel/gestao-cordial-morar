# Classificação Venda/Aluguel sempre editável

## O que acontece hoje

A tela de Agenciamentos trabalha com uma trilha ativa por vez (Venda ou Aluguel), e o filtro segue essa trilha. Quando um agenciamento é reclassificado, ele passa a pertencer à outra trilha e some da lista que está aberta — dando a impressão de que o campo "deixou de existir".

Além disso:

- O atalho de "sem classificação" só aparece enquanto existir algum registro sem classificação; depois que todos são classificados, ele desaparece.
- O painel de detalhes do agenciamento não mostra a classificação nem oferece qualquer ação para trocá-la; a única porta de entrada é abrir o formulário completo de edição.

O campo em si continua no formulário (etapa "Dados do imóvel") e não é escondido por nenhuma condição — o problema é de navegação e de visibilidade da informação, não de permissão.

## Correções

1. **Não perder o registro depois de reclassificar.** Ao salvar uma mudança de Venda para Aluguel (ou o contrário), a tela passa a trocar automaticamente para a trilha nova e mantém o agenciamento em foco, com um aviso curto do tipo "Agenciamento movido para Aluguel". Nada mais "some".

2. **Classificação visível e editável no detalhe.** O painel de detalhes passa a exibir a classificação atual (Venda / Aluguel) junto com um seletor rápido para trocá-la ali mesmo, respeitando as mesmas permissões de edição já existentes e mantendo a confirmação de mudança de trilha e o recálculo de bonificação.

3. **Atalho de classificação sempre disponível.** O filtro "Sem classificação" deixa de ser condicional: fica sempre acessível na barra de filtros, mesmo quando não há pendências, para que dê para revisar e trocar classificações a qualquer momento.

## Detalhes técnicos

- `src/routes/_app.agenciamentos.tsx`: após `updateAgenciamento` com `finalidade` diferente da anterior, chamar `handleTrackChange(novaFinalidade)`; tornar o bloco do banner/atalho de `unclassifiedAgenciamentos` incondicional (mudando o texto quando a contagem for zero).
- `src/components/agenciamentos/AgenciamentoDetailDrawer.tsx`: nova seção "Classificação" com `Select` (Venda/Aluguel), habilitada por `canEditAgenciamento`, disparando o mesmo `AlertDialog` de confirmação de troca de trilha antes de persistir via `updateAgenciamento`.
- `src/components/agenciamentos/AgenciamentoFormModal.tsx`: sem mudança de regra — o campo já é sempre renderizado; apenas garantir que o valor inicial venha de `agenciamento.finalidade` quando existir (já é o caso).
- Sem migração de banco, sem alteração de RLS ou grants.

## Testes

- Teste automatizado do fluxo de reclassificação (trilha de destino calculada e permissão respeitada).
- Verificação no navegador: reclassificar pelo detalhe e pelo formulário, conferir que o card aparece na trilha nova, que a bonificação recalcula e que o campo continua editável depois.
