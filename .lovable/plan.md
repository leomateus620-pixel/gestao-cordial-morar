# Plano — Correção de responsividade do Dashboard

Foco: corrigir overflow horizontal, header sticky, filtro Todas/Cordial/Morar, cards, gráficos, comparativo, bottom nav e FAB, validando mobile (320/390/430/480) e desktop (1366/1920). Sem refazer o dashboard; ajustes pontuais.

## Arquivos a alterar
- `src/components/app-shell.tsx` — shell, header sticky, bottom nav, padding seguro.
- `src/routes/_app.index.tsx` — grids, comparativo horizontal, alturas, paddings, alinhamentos.
- `src/components/fab.tsx` — posicionamento sobre bottom nav + safe-area.
- `src/components/shared/glass-card.tsx` — adicionar `min-w-0` por padrão.
- `src/components/shared/chart-card.tsx` — `min-w-0`, altura responsiva (`h-56 sm:h-64`), padding menor no mobile.
- `src/components/shared/financial-summary-card.tsx` — wrap dos pills, alinhamento de valores, truncate.
- `src/components/agency-switcher.tsx` — altura e largura compactas no mobile.
- `src/styles.css` — `html, body { overflow-x: hidden; max-width: 100vw }`, utilitário `.no-scrollbar`, safe-area helpers.

## Correções por área

### 1. Overflow horizontal (mobile)
- `html, body, #root` ganham `overflow-x: hidden; width: 100%`.
- Em `app-shell.tsx`, no wrapper raiz: trocar `max-w-[1180px]` (que pode estourar com gutters) por `w-full max-w-full lg:max-w-[1180px]` + `overflow-x-hidden`.
- Remover larguras fixas em filhos; trocar `w-[calc(100%-2rem)]` da bottom nav por `inset-x-4` + `max-w-[28rem]`.
- Em todos os grids do dashboard usar `grid-cols-[repeat(auto-fit,minmax(0,1fr))]` ou `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` com `min-w-0` nos filhos.
- ChartCard e GlassCard recebem `min-w-0 w-full`.

### 2. Header sticky
- Mobile: reduzir paddings (`pt-3 pb-2`), tipografia menor, ícones `size-9`. Empilhar saudação + ações em uma linha compacta, AgencySwitcher em linha separada com `h-9`.
- Desktop: header em uma única linha, `py-2`, `rounded-2xl`. Conteúdo principal recebe `scroll-mt` adequado e `pt-3`.
- `main` recebe `pb-[calc(7rem+env(safe-area-inset-bottom))]` no mobile para liberar bottom nav + FAB.

### 3. Filtro Todas / Cordial / Morar
- AgencySwitcher: `h-9` (era maior), `text-xs`, `w-full max-w-full` no mobile, `max-w-xs` no desktop. `min-w-0` nos botões e `truncate`.

### 4. Cards principais (KPIs)
- Substituir grid atual por `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`.
- `MetricCard` com `min-w-0`, `truncate` no valor, `text-xl sm:text-2xl`.

### 5. Resumo financeiro
- Pills em `grid-cols-3 gap-2` com `min-w-0` e `truncate` no valor formatado; padding interno reduzido no mobile (`p-4 sm:p-5`).

### 6. Gráficos
- Cada `ChartCard` wrapper: `w-full min-w-0 overflow-hidden`, altura `h-56 sm:h-64 lg:h-72`, padding `p-3 sm:p-5`.
- `ResponsiveContainer` já é 100%; garantir parent sem largura fixa. Reduzir `fontSize` dos ticks no mobile (10px).

### 7. Comparativo Cordial × Morar
- Mobile: container `flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 no-scrollbar`; cada card `min-w-[85%] snap-start shrink-0`.
- `sm:` em diante: `grid grid-cols-2 gap-4`, sem scroll.

### 8. Bottom navigation
- Manter fixa: `fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100vw-1.5rem)] max-w-[26rem]`.
- `padding-bottom: env(safe-area-inset-bottom)`.
- Labels curtos garantidos via `shortLabel`: Início, Atend., Imóveis, Agenda, Mais (ajustar `module-menu.ts` apenas nos `shortLabel`).
- Cada item `min-w-0`, `truncate`, `text-[10px]`.

### 9. FAB
- `bottom: calc(6rem + env(safe-area-inset-bottom))` no mobile; `lg:bottom-8 lg:right-10`.
- Z-index abaixo de modais mas acima do conteúdo (`z-30`).

### 10. Desktop
- Container do `main` no desktop: `max-w-7xl mx-auto px-6 xl:px-10`.
- Grids de KPIs `lg:grid-cols-4`, gráficos `lg:grid-cols-2`, comparativo `lg:grid-cols-2`.
- Header mais baixo (`py-2`), AgencySwitcher `max-w-xs`.
- Bottom nav escondida em `lg:` (já está com `lg:hidden`); confirmar.

## Validação
- `bunx vite build` deve passar.
- Verificar via preview mobile (375) e desktop: sem scroll horizontal, header compacto, cards alinhados, comparativo com snap, FAB acima da bottom nav.

## Fora de escopo
Login, auth, permissões, Supabase, store, regras de negócio, dados mock principais, rotas protegidas.
