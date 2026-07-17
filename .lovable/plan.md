## Situação atual

O seletor **Cordial / Morar** já está no `RentalFormModal.tsx` (seção Contrato, ao lado do Status) e o modal é o mesmo usado em criação e edição. No modo edição ele já pré-carrega `c.brand ?? "cordial"` e o backend (`rentals.functions.ts`) persiste em `replaceRentalContract`. Ou seja, funcionalmente já dá para definir a imobiliária ao editar os 3 aluguéis existentes.

O que falta é **visibilidade**: nem `RentalCard` nem `RentalExpandedDetails` mostram a marca atual, então o usuário não percebe que já existe a opção e não consegue conferir o valor gravado.

## Mudanças (apenas UI)

1. **`RentalExpandedDetails.tsx`** — no cabeçalho do drawer, exibir um badge "Cordial" ou "Morar" (com a cor da respectiva marca: `var(--cordial-primary)` / `var(--morar-primary)`) ao lado do apelido do imóvel, lendo de `contract.brand`.

2. **`RentalCard.tsx`** — adicionar um pequeno badge de marca no topo do card (mesmo padrão de cor), para permitir identificação rápida na listagem.

3. **`RentalFormModal.tsx`** — nenhum ajuste funcional (o seletor já está lá em edição). Apenas confirmar que, no modo edição, o campo aparece com o valor atual e permite alternar Cordial ↔ Morar antes de salvar.

## Fora de escopo

- Backend, migrações, RLS: nada muda; a coluna `brand` já existe e é persistida.
- Filtros globais: já foram conectados ao switcher na tarefa anterior.
- Redesign do modal ou do drawer.
