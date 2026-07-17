## Objetivo
Remover o usuário **Leonardo** da lista de corretores selecionáveis no cadastro de Atendimentos (e demais menus que usam a mesma lista global), mantendo Bruna e Ricardo (admins que também atuam como corretores).

## Como fazer
Ajustar `src/hooks/useHydrateCorretores.ts`, que hoje inclui todos os perfis com role `corretor` ou `admin`. Adicionar um filtro para excluir o Leonardo pelo nome (case-insensitive, prefixo "leonardo"), preservando os demais admins.

```ts
const onlyCorretores = query.data.filter(
  (p) =>
    (p.role === "corretor" || p.role === "admin") &&
    !/^leonardo\b/i.test(p.nome ?? "")
);
```

## Efeito
- Dropdown "Corretor responsável" em Atendimentos (e qualquer outro menu que consome `corretores` do `app-store`) deixa de listar Leonardo.
- Bruna, Ricardo, Felipe, Pablo, Geandre e "A definir" continuam disponíveis.
- Registros já existentes atribuídos ao Leonardo permanecem no banco; apenas o seletor deixa de oferecê-lo para novos cadastros.

## Arquivos alterados
- `src/hooks/useHydrateCorretores.ts`
