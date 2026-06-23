## Refinar carrossel de features do login (mobile + fluidez)

Objetivo: deixar a vitrine animada do `LoginFeatureShowcase` mais leve no mobile (menor, menos efeitos pesados) e com transição mais suave em todos os tamanhos, sem alterar o conteúdo nem o comportamento de navegação.

### 1. `src/components/login-feature-showcase.tsx`

**Detectar mobile + reduzir trabalho por frame:**
- Adicionar hook `useIsCompactViewport()` (matchMedia `(max-width: 640px)`) com listener, retornando boolean reativo.
- Em `applyPosition`, quando `compact` for true:
  - Reduzir profundidade 3D: `depth = 28 - softDistance*22` (em vez de 56/42)
  - Reduzir `sideRotate` para `clamp(-distance * 3, -7, 7)` (menos rotação Y → menos repaint/compositing)
  - Reduzir `blur` para `Math.max(0, absDistance - 0.5) * 0.6` (blur é o filtro mais caro no mobile)
  - Manter `saturate`/`brightness` mais próximos de 1 (1.02 / 1.0) — reduz custo de filtros encadeados
  - `sideLift` cai para `softDistance * 4`
- Não escrever `--feature-saturate` e `--feature-brightness` no mobile (deixar CSS usar fallback 1) para evitar pipeline de filtros.

**Suavidade da física:**
- Trocar os coeficientes do animator (`0.145` / `0.765`) por valores mais críticos-amortecidos para evitar micro-oscilação no fim: `velocity = (velocity + distance * 0.12) * 0.82`.
- Aumentar threshold de "settled" para `0.004` (corta 1–2 frames extras em telas de 60Hz).

**Throttle de pointermove + tilt 3D só no desktop:**
- Já há guard de `(max-width: 768px)` no `handlePointerMove` interno do card; alinhar com o novo `compact` (640px) e também ignorar quando `pointerType !== "mouse"`.

**Auto-play mais calmo no mobile:**
- `AUTO_SHOWCASE_DWELL_MS` 3600 → no mobile usar 4400 (menos transições por segundo).

### 2. `src/styles.css` (bloco `.login-feature-*`)

**Altura/tamanho responsivos:**
- `.login-feature-viewport`: altura `13.5rem` no base, `15.55rem` em `@media (min-width: 640px)`.
- `.login-feature-card`: `width: 13.5rem; min-height: 11rem;` no base; manter `15.85rem/12.75rem` em `≥640px`.
- Reduzir `padding` interno do card no mobile (`p-3.5` via classe ou override CSS) e `gap` do track para `0.7rem`.
- Tipografia: reduzir `.login-feature-card-title` para `1.05rem` no mobile, texto `.login-feature-card-text` para `0.78rem` line-height 1.4.

**Efeitos mais leves no mobile (`@media (max-width: 639px)`):**
- `.login-feature-card`: trocar `backdrop-filter: blur(18px) saturate(145%)` por `blur(10px) saturate(120%)` (ou remover `saturate`); reduzir as 4 sombras para 2 (`0 18px 32px -28px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.18)`).
- `.login-feature-card-ambient` e `.login-feature-card-noise`: `opacity: 0.35` e desativar animação `login-feature-glow-pulse` (`animation: none`).
- `.login-feature-card::before` (shine radial): `opacity: 0.35`.
- `.login-feature-viewport::before/::after` (máscaras laterais): largura `1.4rem`.

**Transições mais suaves (todos os tamanhos):**
- Trocar a curva da transição do card de `cubic-bezier(0.19, 0.88, 0.28, 1)` 280ms para `cubic-bezier(0.22, 0.61, 0.36, 1)` 360ms em `transform/opacity/filter`. Curva mais "ease-out" longo reduz sensação de "trava" no fim.
- Adicionar `transition: transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)` em `.login-feature-track` para o caso de mudança via pip no mobile.
- `.login-feature-progress-fill`: transição `width 220ms linear` → `260ms ease-out`.

**Hint de composição:**
- Adicionar `transform: translateZ(0)` em `.login-feature-card-ambient` e `.login-feature-card-noise` para forçar camadas separadas (anti-jank em Safari mobile).
- Manter `will-change: transform` no track; remover `will-change` dos cards no mobile (`@media (max-width: 639px) { .login-feature-card { will-change: auto; } }`) — `will-change` em muitos elementos custa GPU em telas pequenas.

### 3. Sem mudanças funcionais

- Rotas, auto-play, drag, navegação por pips, acessibilidade (`aria-*`) permanecem idênticos.
- Conteúdo dos features (textos, ícones, cores) inalterado.
- Comportamento desktop continua igual visualmente; ganha apenas curva de easing mais suave.

### Resumo do impacto

| Aspecto | Antes | Depois (mobile) |
|---|---|---|
| Altura viewport | 15.55rem | 13.5rem |
| Card width | 15.85rem | 13.5rem |
| Backdrop filter | blur(18px) sat(145%) | blur(10px) sat(120%) |
| Sombras por card | 4 | 2 |
| Rotação Y máx | 15° | 7° |
| Blur lateral máx | ~2.9px | ~1.3px |
| Animação ambient pulse | sim | desligada |
| Curva transição | 280ms (snappy) | 360ms (ease-out suave) |
