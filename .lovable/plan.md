## Objetivo

Permitir escolher a imobiliária responsável (Cordial / Morar) no cadastro/edição de aluguéis e refletir isso no filtro global (switcher "Todas / Cordial / Morar") já existente no topo.

## Diagnóstico

- O tipo `RentalContract` já tem `brand: "cordial" | "morar" | "ambas"` e o banco persiste esse campo.
- No `RentalFormModal.tsx` o valor está hardcoded como `"cordial"` (linhas 479 e 493) — não há UI para escolher, e a edição não pré-carrega o brand atual.
- O switcher global (`AgencySwitcher` → `useApp().agency`) já existe, mas `useRentals.ts` não filtra os contratos por `brand`. Hoje o switcher não afeta a lista de aluguéis.

## Mudanças

### 1. `src/components/alugueis/RentalFormModal.tsx`
- Novo estado `brand: RentalBrand` (default `"cordial"`, ou `initial.brand` na edição).
- Adicionar seletor no bloco "Contrato" (segmented control com 2 opções: **Cordial** e **Morar**) — mesmo padrão visual dos outros toggles do formulário.
- Passar `brand` para o payload:
  - `property.data.brand` (linha 479) — apenas quando criando novo imóvel; se `existingId`, não altera o imóvel.
  - Contrato: `brand` (linha 493).
- Incluir `brand` no `applyInitial` para pré-preencher na edição.
- Incluir `brand` no `reset()`.

### 2. `src/hooks/useRentals.ts`
- Ler `agency` do `useApp` e filtrar `contracts` no `useMemo` já existente:
  - `agency === "todas"` → sem filtro
  - caso contrário → manter itens onde `c.brand === agency || c.brand === "ambas"`
- Assim o switcher global passa a operar sobre a lista de aluguéis, sem quebrar filtros de status/busca.

## Fora de escopo

- Não mexer em RLS/schema (coluna `brand` já existe em `rental_contracts` e `rental_properties`).
- Não renomear/redesenhar o switcher global.
- Não alterar brand de imóveis já existentes (evita efeito colateral em outros contratos que reutilizem o mesmo imóvel).
- Não mexer em fluxo de fiador/locatário.
