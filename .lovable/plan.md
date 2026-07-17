## Objetivo
Remover os 3 clientes de teste (Leonardo Almeida, Leonardo Mateus, Ricardinho Zimermann) da tabela `public.clients` para deixar a lista pronta para uso real.

## Ação
- Executar `DELETE FROM public.clients` filtrando pelos nomes acima.
- Sem alterações de schema, RLS, código ou UI.

## Impacto
- O menu "Clientes" passa a exibir apenas registros reais.
- Ação irreversível.
