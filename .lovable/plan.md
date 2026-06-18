## Objetivo
Reduzir poluição visual no topo da página Agenda fundindo o header "Agenda" com o card "Novo compromisso" em um único card unificado, e removendo o campo de busca.

## Mudanças

### 1. `src/routes/_app.agenda.tsx`
- Remover a `<section>` do header "Agenda / Central operacional da equipe" (linhas 91-118).
- Remover o render condicional do `AgendaCreateCard` separado.
- O novo card unificado passa a ser o primeiro elemento da página (sempre visível; quando o usuário não tem permissão `agenda:write`, o CTA "Agendar" fica oculto, mantendo o card como header informativo).
- Remover prop `query` e `onQueryChange` da chamada `<AgendaFilters>` (não há mais busca).
- Manter o estado `query` removido — limpar `useState("")` e o argumento passado para `useAgenda`.

### 2. `src/components/agenda/AgendaCreateCard.tsx`
Transformar em um card híbrido (header + CTA):
- Título principal: **"Agenda"** (h1) com subtítulo unificando ambos os textos: "Organize e agende visitas, fotos, vídeos, retornos, assinaturas e tarefas da equipe."
- Manter eyebrow "Central operacional da equipe".
- Manter os chips de tipo (Visita / Fotos / Retorno / Assinatura) — agora atuam como contexto visual do que se pode agendar.
- Manter o CTA "Agendar" no canto direito (mobile: botão circular; desktop: pill).
- Aceitar prop opcional `canCreate: boolean`. Quando `false`, esconder o CTA e desativar o clique, mas manter visual de header.
- Ajustar tom: o card vira ao mesmo tempo identidade da página e ação principal, então usar o gradiente atual (mais saturado) e aumentar levemente o padding vertical para acomodar a hierarquia de header.

### 3. `src/components/agenda/AgendaFilters.tsx`
- Remover o input de busca (linhas 69-84) e a div container.
- Remover props `query` e `onQueryChange` da interface.
- O botão "Filtros" fica alinhado à direita, na mesma linha dos chips de período (ou em linha própria abaixo deles, alinhado à direita) para manter ergonomia.

### 4. `src/hooks/useAgenda.ts`
- Verificar assinatura: se `useAgenda(query, filters)` exige `query`, passar string vazia constante a partir da page (mais seguro/menos invasivo) OU tornar o parâmetro opcional. Plano: passar `""` na page para evitar tocar no hook.

## Resultado visual
Topo da Agenda passa de 3 blocos (header + filtros com busca + create card) para 2 blocos enxutos:
1. **Card unificado Agenda + Novo compromisso** (identidade + CTA)
2. **Filtros** (chips de período + botão Filtros, sem busca)

Seguido por: summary cards → timeline.
