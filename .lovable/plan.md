# Refinamento visual dos cards de Agenciamentos

Foco: cards com identidade própria, respiração entre eles, profundidade 3D suave e tipografia com mais peso — sem alterar dados, ações ou lógica.

## 1. Lista com respiração (`src/routes/_app.agenciamentos.tsx`)

- Substituir o container `divide-y … rounded-[1.4rem] border … backdrop-blur-xl` que agrupa os cards por um wrapper transparente com espaçamento vertical:
  - `className="space-y-3.5 sm:space-y-4"` (sem borda, sem fundo, sem divide).
- Assim cada `AgenciamentoCard` vira um cartão independente com sombra própria, resolvendo a queixa de "cards colados".

## 2. Card com profundidade e refino (`src/components/agenciamentos/AgenciamentoCard.tsx`)

Estrutural:
- Wrapper `<article>` vira cartão autônomo:
  - `rounded-2xl border border-foreground/6 bg-white`
  - Sombra em camadas para 3D suave: `shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(23,27,33,0.05),0_18px_36px_-24px_rgba(23,27,33,0.28)]`
  - Hover: `hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(23,27,33,0.06),0_28px_48px_-24px_rgba(23,27,33,0.32)] hover:border-foreground/10`
  - Transições suaves (`transition-[transform,box-shadow,border-color] duration-200`), `motion-reduce:transition-none`.
  - Padding maior: `px-5 py-5 sm:px-6 sm:py-5`.
- **Remover a barra azul vertical** (`<span aria-hidden>` com `bg-[var(--…-primary)]`). No lugar, a marca fica só no chip "Cordial/Morar" (já existente), com cor mais viva:
  - Chip da imobiliária ganha cor por marca: Cordial → `bg-[color-mix(in_oklab,var(--cordial-primary)_10%,white)] text-[var(--cordial-primary)] border-[var(--cordial-primary)]/20`; Morar → equivalente com `--morar-primary`; Ambas → `--system-primary`.
- Sem alteração no grid interno (mesmas 4 colunas em xl), mantendo a densidade atual.

Tipografia e contraste (fim das opacidades fracas):
- Título do imóvel: `text-base font-extrabold text-foreground` (era `text-[15px]`, cor herdada).
- Nome do proprietário / corretor: `text-foreground/90 font-semibold` (era `/78`, `/76`).
- Endereço/localização: `text-foreground/70` (era `/56`).
- Telefone, data: `text-foreground/60` (era `/52`, `/54`).
- Labels "Responsabilidade", "Checklist operacional": `text-[11px] font-bold uppercase tracking-wider text-foreground/55` (mais legíveis, com hierarquia clara).

Checklist e chips:
- Barra de progresso: fundo `bg-foreground/10`, preenchimento gradient `bg-gradient-to-r from-[#174d61] to-[#2d8fa8]`, altura `h-2`, com `shadow-[0_1px_2px_rgba(23,77,97,0.35)]` no preenchimento para 3D leve.
- Contador `X/6 · Y%`: manter tabular-nums, cor `text-primary`, peso extra-bold.
- Chips de pendência: aumentar contraste — `bg-[color-mix(in_oklab,var(--system-accent)_14%,white)] text-[var(--system-accent-dark)] border border-[var(--system-accent)]/22`, `px-2 py-1`, ícone `size-3.5`.
- Chip "Checklist concluído": `bg-emerald-500/12 text-emerald-800 border border-emerald-500/25`.
- Chip "+N pendências": `bg-foreground/8 text-foreground/70`.

Bloco central (Responsabilidade):
- Em md apenas: fundo `bg-[#f7f4f0] border-foreground/8`, `rounded-xl`; em xl volta a ser transparente (como hoje).
- Ícone `UserRound` do corretor com cor `text-[#174d61]`, avatar suave — mantido simples.

Ações (botões):
- "Detalhes": `bg-white border-foreground/12 hover:bg-foreground/4`, `text-foreground/85 font-semibold`, sombra sutil `shadow-[0_1px_2px_rgba(23,27,33,0.04)]`.
- Botão editar: mesmo tratamento.
- "Validar": manter `bg-[#174d61]`, adicionar `shadow-[0_8px_18px_-10px_rgba(23,77,97,0.7)]` e `hover:-translate-y-px`.
- Ícones Drive/Site: `text-foreground/55 hover:text-primary hover:bg-foreground/5`.

Divisor interno (linha antes do proprietário):
- Trocar `border-t border-foreground/7` por `border-t border-foreground/8` mantendo, mas com `pt-2.5 mt-2.5` para respirar.

## 3. Verificação

- Rodar typecheck automático.
- Validar visualmente em `/agenciamentos` (desktop + mobile via Playwright headless: screenshot da lista com 2-3 cards, verificar separação entre cards, ausência da barra azul, contraste tipográfico e profundidade).
- Confirmar que estados (Novo, Cordial/Morar, Validado, com/sem pendências) continuam com identidade visual clara.

## Fora do escopo

- Sem mudanças em hooks, RLS, drawer de detalhes ou modal de cadastro.
- Sem novas dependências.
