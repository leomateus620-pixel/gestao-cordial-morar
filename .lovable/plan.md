
## Objetivo

Elevar visualmente a primeira dobra do menu **Aluguéis** (`/alugueis`), hoje composta por um título simples + botão "Novo aluguel" solto no canto + faixa de 6 KPIs pequenos e sem hierarquia. Vamos transformá-la em uma seção com cara de produto premium, mantendo 100% da funcionalidade atual (nenhuma mudança em dados, hooks ou lógica de negócio).

Escopo: **apenas UI/apresentação** em dois componentes:
- `src/routes/_app.alugueis.tsx` (header)
- `src/components/alugueis/RentalKpiCards.tsx` (faixa de KPIs)

Sem tocar em `useRentals`, server functions, RLS, filtros, cards de contrato ou modais.

---

## Direção de design

Mesma linguagem já aplicada em Agenciamentos (cards flutuantes, sombras 3D suaves, chips vivos, tipografia contrastada), para consistência entre módulos:

- Card "hero" horizontal com fundo em vidro + gradiente radial sutil de marca, sombra multi-camada e leve highlight interno.
- Título "Aluguéis" em destaque tipográfico forte (peso extra-bold, tracking apertado), com subtítulo curto e um par de chips inline mostrando contexto rápido (ex.: contratos ativos + receita mensal) — sem duplicar os KPIs abaixo, apenas ancorando o hero.
- Botão "Novo aluguel" reposicionado dentro do card hero, à direita, com aparência elevada (gradiente primário, ícone `Plus` animado no hover, micro-scale ao clicar).
- Faixa de KPIs redesenhada logo abaixo: cards maiores, com hierarquia clara (valor grande + label acima em micro-caps + ícone tonalizado), separação real entre eles, e o card "Receita mensal" com tratamento de destaque (variação `primary`) quando visível.

### Header (novo)

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Aluguéis                                    [ + Novo aluguel ]     │
│  Controle real de contratos, locatários e pagamentos.               │
│  • 5 ativos   • R$ 9k/mês   • 1 vencendo em 30d                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Container: `rounded-[1.75rem]`, borda `white/70`, `backdrop-blur`, sombra em duas camadas (drop + inset highlight).
- Gradiente radial decorativo posicionado no canto direito (tom teal/cordial), sem interferir na leitura.
- Chips de contexto derivados de `r.kpis` (reutiliza dado já carregado — zero requests novos). Ocultos para roles sem `canViewFinancialInsights` no chip de receita.

### KPIs (refino)

- Grid mantém 2/3/6 colunas responsivas.
- Cada card: `rounded-2xl`, borda sutil, fundo `white/68` com `backdrop-blur`, sombra 3D suave (igual padrão Agenciamentos).
- Label em micro-caps `text-[10px] tracking-wider text-foreground/60`.
- Valor em `text-2xl font-extrabold tabular-nums`.
- Ícone tonal por categoria (primary, success, warning, danger, neutral) — mantém a semântica atual.
- "Receita mensal" ganha variante primária (fundo escuro cordial + texto claro) para virar âncora visual da faixa; permanece condicionado a `canViewFinancialInsights`.
- Remove o gradiente pastel atual (baixa legibilidade) — substitui por tom sólido + ícone colorido.

### Animações

- Fade+slide-up leve no hero ao montar (Tailwind + `transition` puros, sem libs novas).
- Hover no botão: brilho + translate-y de -1px.
- Hover nos KPIs: elevação sutil da sombra.

---

## Passos de implementação

1. **`src/routes/_app.alugueis.tsx`**
   - Substituir o bloco `<header>` atual por um card horizontal premium.
   - Mover o botão "Novo aluguel" para dentro do card, alinhado à direita, com estilo elevado.
   - Adicionar linha de chips de contexto derivados de `r.kpis` (respeitando `canViewFinancialInsights` obtido via `useApp`/role, seguindo padrão já usado em outras telas).
   - Não alterar seções seguintes (`RentalKpiCards`, filtros, lista, modais).

2. **`src/components/alugueis/RentalKpiCards.tsx`**
   - Refatorar o subcomponente `Kpi` para o novo visual (sem mudar props públicas).
   - Adicionar variante `featured` para "Receita mensal".
   - Manter o gate `canViewFinancialInsights` existente.

3. **Validação**
   - Rodar typecheck/build.
   - Verificar em viewport mobile (2 colunas), tablet (3) e desktop (6) que a faixa não quebra.
   - Verificar que roles sem insight financeiro (`corretor`) não veem receita nem o chip correspondente.

---

## Fora de escopo

- Cards de contrato, filtros, modal de cadastro/edição, documentos, permissões, RLS, hooks, server functions.
- Nenhuma nova dependência.
