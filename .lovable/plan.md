## Ajustes na tela de Atendimentos

### 1. Remover duplicidade do seletor de imobiliária
Em `src/components/atendimentos/AtendimentoFilters.tsx`, remover o bloco `agencyOptions` (Todas/Cordial/Morar) que aparece dentro do componente de filtros. O seletor global do header (`agency-switcher`) continua sendo a fonte única. Remover também as props `agency` e `onAgencyChange` de `AtendimentoFilters` e do call site em `src/routes/_app.atendimentos.tsx`.

### 2. Filtros colapsados por padrão
Hoje, no desktop (≥`lg`), os selects de Finalidade/Tipo/Origem/Corretor/Prioridade/Período aparecem sempre expandidos. Reestruturar para:

- Linha 1 (sempre visível): busca + botão "Filtros" com contador `activeSecondary` + atalho "Limpar" quando houver filtros ativos. Mesma linha em mobile e desktop (remover `lg:hidden` do botão).
- Linha 2 (sempre visível): chips de status (`Todos`, `Novo`, `Em atendimento`, …) com scroll horizontal — já está OK, manter.
- Linha 3 (colapsada por padrão): grade de selects secundários (Finalidade, Tipo, Origem, Corretor, Prioridade, Período) só renderiza quando `showFilters` é true. Em desktop usar `flex flex-wrap`, em mobile `grid grid-cols-2`. Botão "Limpar filtros" mantido dentro desse bloco também.
- Estado inicial: `showFilters = false` em todos os breakpoints.
- Animação de expansão suave (`transition-[grid-template-rows]` ou simples `animate-accordion-down` da nossa lib) para não parecer abrupto.

### 3. Revisar CTA "Novo atendimento"
Com o seletor duplicado removido, a área acima do card encolhe. Validar que:
- O card "Novo atendimento" continua acima dos chips de status e do resumo? Hoje a ordem é: filtros → CreateCard → Summary → lista. Manter essa ordem (card visível sem rolagem no desktop, logo após a busca/chips).
- O hero "Central de entrada comercial" já carrega o título; o CTA não precisa repetir contexto. Manter conteúdo do card como está, apenas garantir que ele respira melhor agora que há menos elementos empilhados (sem alterar gradiente, chips ou animação aprovados).
- Nenhum ajuste de cor/identidade visual.

### Arquivos alterados
- `src/components/atendimentos/AtendimentoFilters.tsx` — remover bloco agency, ajustar layout dos filtros secundários para colapsar, mover botão "Filtros" para visível em todos os breakpoints.
- `src/routes/_app.atendimentos.tsx` — remover props `agency`/`onAgencyChange` na chamada de `AtendimentoFilters` (mantém uso de `setAgency` apenas via header global).

### Fora de escopo
- Sem mudanças em store, services, types, hero, card de criação, modal, summary cards, lista, ou outras rotas.
- Sem alteração de identidade visual (cores, gradientes, glass).
