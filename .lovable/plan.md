## Escopo
Validar PR #15 (Clientes) e corrigir somente: delay ao fechar o modal de cadastro no mobile e ajustes de responsividade do modal. Nenhuma refatoração nem alteração fora de Clientes.

## Causa raiz do delay/quebra no mobile
1. Modal próprio sem animação de saída — `if (!open) return null` desmonta instantaneamente, mas dois `backdrop-blur` empilhados (`backdrop-blur-[3px]` no overlay + `backdrop-blur-2xl` no form) derrubam o frame rate móvel, gerando a percepção de "atraso".
2. `setTimeout(180ms)` após submit antes de fechar soma à sensação de travado.
3. Footer sem `safe-area-inset-bottom` → botão Salvar colado na home indicator.
4. Header consome altura demais em 360–390px.
5. `ClientCreateCard` aplica transform 3D no `:hover`, que em touch fica "preso" após o tap.

## Mudanças (apenas 3 arquivos)

### 1) `src/components/clients/ClientFormModal.tsx`
- Estado local `closing` + helper `requestClose()`:
  - Adiciona classes `.client-form-modal--closing` / `.client-modal-backdrop--closing`.
  - Chama `onOpenChange(false)` após ~160 ms (timeout curto).
- Backdrop: `bg-stone-950/40` no mobile, `sm:backdrop-blur-sm` no desktop (remove o blur do overlay no mobile).
- Form: remover `backdrop-blur-2xl`, usar `bg-background` opaco (mantém visual premium, elimina blur empilhado).
- Header: `py-3 sm:py-4`, título `text-lg sm:text-xl`, descrição `hidden sm:block`.
- Footer: `pb-[max(1rem,env(safe-area-inset-bottom))]`.
- `submit`: fechar imediatamente (remover `setTimeout(180)`), o toast de sucesso já comunica.
- Trocar handlers (X, backdrop, Cancelar, ESC) para chamar `requestClose()`.

### 2) `src/styles.css`
- Novos keyframes `client-form-island-out` (scale 1→0.96, opacity 1→0, 160 ms) e `client-modal-backdrop-out` (opacity 1→0, 140 ms).
- Aplicar via `.client-form-modal--closing` / `.client-modal-backdrop--closing`.
- `@media (max-width: 640px)`: `client-form-island-in` reduzido para 240 ms.
- `@media (prefers-reduced-motion: reduce)`: animações em `0.01ms`.

### 3) `src/components/clients/ClientCreateCard.tsx`
- Mover o transform 3D do `:hover` para dentro de `@media (hover:hover)` no styles.css (ou usar guarda Tailwind `[@media(hover:hover)]:hover:...`). Em mobile, manter apenas o `active:` discreto. Sem mudança estrutural.

## Não mexer
- Rotas, store, services, tipos, hooks, sidebar, mock data.
- Dashboard, Atendimentos, Agenda, Contratos.
- Lógica de validação, salvamento mock, filtros e summary.

## Validação após aplicar
- `bunx vite build` (TypeScript strict).
- Playwright 390×844 e 1366×900: abrir `/clientes`, criar cliente, fechar via X / backdrop / ESC, screenshot em cada passo, console limpo.
- Navegar Clientes ↔ Atendimentos ↔ Agenda ↔ Dashboard sem regressão.

## Checklist PR a reportar
Rota e menu OK • FAB removido • Card "Criar cadastro" acima da lista • Modal abre/fecha fluido em mobile e desktop • Validações funcionam • Cliente mock aparece na lista e atualiza summary/filtros/busca • Mobile sem overflow / botões cobertos pela barra • Build verde • Nada fora do escopo alterado.

## Entrega
Resposta final lista: arquivos alterados (3), problemas corrigidos, comportamento mobile, comportamento desktop, status do build, checklist do PR validado.
