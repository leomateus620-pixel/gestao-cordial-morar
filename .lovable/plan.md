
## Resultado da auditoria do menu Corretores

A implementação está completa e coerente com o escopo:

- Rota `/corretores` com guard `admin_owner` + `corretores:read` e fallback "Acesso restrito".
- Permissões: módulo `corretores` exclusivo do `admin_owner` (sidebar e roteamento já restringem corretor, secretária e financeiro).
- `useCorretores` centraliza store, normalização, filtros, ranking, summary e dados para o dashboard, com `useMemo` em todas as derivações.
- Service com normalização defensiva (fallback para `LegacyCorretor`), filtros, ranking, summary, chart e cálculo de checklist.
- Tela com hero gradient + 6 KPIs + filtros + ranking compacto (Top 3 + destaques) + grid de cards 3D + drawer com 4 abas (Desempenho, Agenciamentos, Comissões, Histórico).
- Dashboard tem `TeamPerformanceCard` e gráfico admin-only com link "Ver corretores".

Restam ajustes finos, sem reescrever nada.

## Bugs e polimento a corrigir

1. **Performance no Dashboard para perfis não-admin** — `_app.index.tsx` chama `useCorretores()` sempre, calculando ranking/summary/chart mesmo quando `isAdminOwner` é falso. Ajuste: tornar essas derivações `dashboard*` lazy (calcular só quando necessário) — solução mínima é renomear o hook para aceitar `{ skipDashboard?: boolean }` ou condicionar no consumidor via `useMemo` baseado em `isAdminOwner`. Manter API atual; só evitar trabalho extra.

2. **`CorretoresFilters` — input de busca dessincroniza com o Select de corretor** — digitar no input livre coloca um valor parcial em `filters.busca`, e o Select cai para "todos" (porque não encontra match exato). Ajuste mínimo: separar conceitos — input livre escreve em `filters.busca`; quando usuário escolhe no Select, também grava em `filters.busca` (já faz), mas ao limpar o input não voltar para "todos" com flicker. Solução: usar `selectedBroker?.nome ?? ""` como valor controlado e adicionar `placeholder` "Todos os corretores" no trigger quando vazio.

3. **`CorretorCard` — tilt 3D no mobile** — `handlePointerMove` já ignora `touch`, mas `transformStyle: preserve-3d` + `perspective` permanecem ativos. No mobile (≤768px) reduzir para sem tilt: aplicar `@media (max-width: 768px)` na regra de transform via classe utilitária, mantendo só hover `scale` em desktop. Reduz custo de composição em listas longas.

4. **Hero da rota — pílulas no mobile** — `grid grid-cols-3` ocupa linha inteira; em telas estreitas (390px), o valor `45%` quebra. Aplicar `min-w-0` + `text-base` no mobile e `sm:text-lg`. Pequeno ajuste tipográfico.

5. **`CorretoresSummaryCards` — `xl:grid-cols-6`** — em 1280–1366px os 6 cards ficam com largura 200px e o valor `R$ 19,5k` se aproxima do limite. Mudar fallback para `lg:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-6` está OK; reduzir `text-3xl` para `text-2xl` no xl mantém leitura sem corte.

6. **`CorretorDetailDrawer` — close button** — Já posicionado com `[&>button]:right-5 [&>button]:top-5`. Adicionar `z-10` para garantir cliques acima do header em algumas resoluções.

7. **`CorretorDetailDrawer` — drawer no mobile** — `side="right"` em `w-full max-w-full` no mobile vira full-screen — ok, mas a animação lateral é menos natural que bottom-sheet. Como já está no escopo "bottom-sheet ou full-screen", manter full-screen e apenas garantir `h-dvh` (já está) e `overscroll-behavior: contain` no container scrollável para evitar puxar a página atrás.

8. **Console warnings de recharts** (`width(-1) and height(-1)`) — vêm de ResponsiveContainer renderizando antes do layout estabilizar. No `ChartCard "Performance da equipe"` adicionar `minWidth={0}` no container e garantir que o pai tenha `min-w-0`. Bug pré-existente do Dashboard que toca a equipe; aproveitar para mitigar.

9. **Dados mock** — confirmar que `corretoresSeed` tem ao menos 4 corretores (Marcos, Paula, Felipe, Camila), distribuídos entre Cordial/Morar/Ambas, com 1 inativo. Se não tiver, completar em `src/lib/mock/data.ts` mantendo o formato `LegacyCorretor` (normalização preenche o resto).

10. **Validação rápida** — após as edições, rodar:
    - `bunx tsc --noEmit` (verificação de tipos local) — opcional, build do harness cobre.
    - Navegação manual via Playwright a `/corretores` em viewport 390 e 1366; abrir drawer; trocar filtros; checar console.

## Não fazer

- Não introduzir banco real / Supabase / APIs externas.
- Não tocar em Agenciamentos.
- Não refatorar arquitetura nem alterar identidade visual.
- Não mexer em outras rotas além dos ajustes mínimos de performance no Dashboard.

## Arquivos a editar

- `src/routes/_app.index.tsx` (lazy dashboard derivations, minWidth no chart)
- `src/routes/_app.corretores.tsx` (hero pills polish)
- `src/components/corretores/CorretoresFilters.tsx` (sincronia busca/select)
- `src/components/corretores/CorretoresSummaryCards.tsx` (tipografia xl)
- `src/components/corretores/CorretorCard.tsx` (desativar tilt no mobile)
- `src/components/corretores/CorretorDetailDrawer.tsx` (z-index do close + overscroll)
- `src/hooks/useCorretores.ts` (opção `skipDashboard`)
- `src/lib/mock/data.ts` (apenas se faltar corretor do seed)

## Checklist final a reportar após implementar

build, rota `/corretores`, guard admin-only, filtros isolados/combinados, ranking, cards, drawer, comissões previstas/pagas, seção do Dashboard, link "Ver corretores", desktop 1366px, mobile 390px, console sem warnings novos.
