## Objetivo
Tornar os 6 cards do "Resumo operacional" em Agenciamentos clicáveis, aplicando um filtro correspondente à lista abaixo, com indicação visual do card ativo e rolagem suave até os resultados.

## Mapeamento card → filtro
Reaproveitando `AgenciamentoFiltersState` (já usa `status` e `checklist`):

| Card | Filtro aplicado |
|---|---|
| Agenciamentos no período | `status: "todos"`, `checklist: "todos"` (limpa) |
| Pendentes de validação | `status: "aguardando_validacao"` |
| Fotos pendentes | `checklist: "sem_fotos"` |
| Placas pendentes | `checklist: "sem_placa"` |
| Imóveis fora do site | `checklist: "fora_site"` |
| Agenciamentos validados | `status: "validado"` |

O período (`periodo`) e demais filtros são preservados.

## Alterações

### 1. `src/components/agenciamentos/AgenciamentoSummaryCards.tsx`
- Cada `Metric` recebe uma `key` estável (`total | pendentes | fotos | placas | site | validados`).
- Nova prop `onSelect(key)` e `activeKey`.
- `<article>` vira `<button type="button">` mantendo o mesmo layout; adiciona `aria-pressed`, foco visível, `hover/active` sutil (translate/scale), e um estado ativo (anel/borda destacada) quando `activeKey === key`.
- Contagens zeradas continuam clicáveis (mostram lista vazia com o filtro aplicado — comportamento consistente).

### 2. `src/routes/_app.agenciamentos.tsx`
- Adiciona `listRef = useRef<HTMLElement>(null)` na `<section aria-labelledby="agenciamentos-list-title">`.
- Deriva `activeSummaryKey` a partir de `filters.status`/`filters.checklist` para destacar o card correspondente.
- Handler `handleSummarySelect(key)` que chama `setFilters(...)` com o preset e faz `listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })`.
- Passa `onSelect` e `activeKey` para `<AgenciamentoSummaryCards>`.

## Fora do escopo
- Sem mudanças de schema, RLS, hooks ou queries — apenas UI/estado local de filtros já existente.
- Sem alteração no `AgendaSummaryCards` (a solicitação é sobre Agenciamentos).