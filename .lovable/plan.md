# Redesign do topo do menu Agenciamentos

Aplicar a direção "Minimalist operational" escolhida. Mudanças apenas de UI/estilo — sem alterar dados, hooks, RLS ou lógica de negócio.

## 1. Header horizontal em destaque (`src/routes/_app.agenciamentos.tsx`)

- Remover o bloco de 3 KPIs do header ("No período", "Aguardam validação", "Checklist médio") — já aparecem no `AgenciamentoSummaryCards` abaixo.
- Remover a função interna `HeaderStat` (não usada em outro lugar).
- Transformar a `<section>` do header num card horizontal, mais premium:
  - Fundo `bg-white/70` com `backdrop-blur-md`, borda `border-white/70`, `rounded-[1.75rem]`, sombra suave (`0_24px_64px_-46px…`).
  - Halo decorativo (radial gradient em `#174d61`) no canto superior direito, com leve `scale` no hover do card.
  - Ícone `ClipboardCheck` num quadrado 48px com fundo `#174d61/10` e ring interno.
  - Título "Agenciamentos" (2xl/1.75rem, extra-bold) + subtítulo cinza.
  - CTA "Cadastrar agenciamento" à direita: `h-12`, `rounded-2xl`, `bg-[#174d61]`, sombra pronunciada, hover com `-translate-y-0.5` e sombra mais forte, ícone `Plus` girando 90° no hover.
- Mobile: layout empilha (`flex-col`), CTA full-width; desktop (`lg:`) volta a linha única com CTA à direita.

## 2. Card de filtros mais clean (`src/components/agenciamentos/AgenciamentoFilters.tsx`)

Manter toda a lógica, tipos e estado — apenas refinar hierarquia visual:

- Card externo: `rounded-[1.75rem]`, `bg-white/70`, `backdrop-blur-md`, `border-white/70`, padding maior (`p-5 sm:p-6`), sombra suave.
- Cabeçalho do card: título "Filtros operacionais" à esquerda com ícone e badge de "N ativos"; botão "Limpar filtros" à direita como link fantasma discreto (texto `text-foreground/45 hover:text-primary`, ícone `RotateCcw` 3.5).
- Desktop:
  - Linha superior em `grid grid-cols-12 gap-6`: à esquerda (col-span 5) o toggle "Escopo da imobiliária" (Todas/Cordial/Morar) com pílulas mais delicadas; à direita (col-span 7) a busca com placeholder atualizado e ícone de lupa.
  - Divisor `border-t border-foreground/8` entre a linha superior e os filtros específicos.
  - Linha inferior em `grid grid-cols-2 md:grid-cols-5 gap-4` com labels em micro-caps (`text-[11px] uppercase tracking-wider font-semibold text-foreground/45`) acima de cada `Select` compacto (`h-10 rounded-lg bg-[#f7f4f0]`).
- Mobile: manter estrutura atual (search + botão que abre o `Sheet`), aplicando os novos tokens (radius/cores/labels) para consistência.
- Todos os componentes internos (`SearchField`, `AgencyScope`, `StatusSelect`, `TypeSelect`, `ChecklistSelect`, `BrokerSelect`, `FilterLabel`) permanecem, ajustando apenas classes de estilo.

## 3. Fora do escopo

- Não alterar `AgenciamentoSummaryCards`, `AgenciamentoCard`, hooks, RLS, ou o formulário de cadastro.
- Sem novas dependências.

## Verificação

- Rodar typecheck automático.
- Conferir visualmente header + filtros em desktop e mobile via preview.
