## Objetivo

No cabeçalho do sidebar (desktop e drawer mobile) aparece um ícone genérico de "prédio" (Lucide `Building2`) dentro de um chip ciano. Substituir esse ícone pela logomarca real da Gestão Cordial — a mesma usada no favicon / `public/logo-gestao-cordial-morar.svg`.

## Onde está hoje

`src/components/app-shell.tsx`:
- Linhas 78-81 — chip do brand no sidebar desktop usa `<Building2 className="size-5" />`.
- Linhas 155-157 — mesmo chip no `SheetContent` mobile usa `<Building2 className="size-5" />`.
- Import de `Building2` em `lucide-react` (linha 2) fica órfão depois da troca.

O SVG completo em `public/logo-gestao-cordial-morar.svg` é a versão "horizontal" (980×280, marca + wordmark). Não serve cru para um chip quadrado de 44px — só a parte do símbolo (logomark) deve aparecer ali. O `favicon.ico` já é o símbolo recortado, mas .ico não é ideal para renderizar nítido em 44px @2x num chip.

## Plano

1. **Criar componente de logomark dedicado** `src/components/brand/BrandMark.tsx`:
   - Componente React que retorna apenas o `<svg>` do símbolo (viewBox recortado para o miolo do logo atual, sem o wordmark e sem o fundo bege `#FBF8F4`).
   - Aceita `className` para tamanho/cor; usa `currentColor` ou cores do design system (ciano) para casar com o tema escuro do sidebar.
   - Fonte: paths já presentes em `public/logo-gestao-cordial-morar.svg` (área aproximada `x 49–236, y 56–230`), reaproveitados num viewBox próprio (ex.: `0 0 200 200`).

2. **Atualizar `src/components/app-shell.tsx`**:
   - Importar `BrandMark` no lugar de `Building2`.
   - Linha 78-81: trocar `<Building2 className="size-5" />` por `<BrandMark className="size-6" />`. Manter o chip arredondado, o anel ciano e o "dotinho" pulsante para preservar o visual premium atual.
   - Linha 155-157: mesma troca no header do drawer mobile.
   - Remover `Building2` do import de `lucide-react` (somente nesse arquivo; outros arquivos que usam `Building2` em outros contextos não são tocados).

3. **Sem mudanças em texto/labels**: "Gestão Cordial" / "Sistema Imobiliário" continuam iguais. Só o glifo muda.

4. **Validação**:
   - `tsgo --noEmit` para checar imports.
   - Conferência visual via Playwright em desktop (1280px) e mobile (375px) abrindo `/` e o drawer mobile, confirmando que o chip exibe a logo real e mantém alinhamento/sombra.

## Fora de escopo

- Não mexer no favicon, no `__root.tsx`, em outras telas (login, headers de páginas) nem em outros usos de `Building2` em filtros/cards.
- Não alterar layout, cores do chip, animação do badge ou texto ao lado.
