## Objetivo

Nas duas agendas (`Visitas e compromissos` e `Agenda de fotos`), a lista deve sempre abrir mostrando primeiro o que é atual/futuro, e só depois o histórico — que fica no scroll, do mais recente para o mais antigo.

## Situação atual (verificada)

- Ambas as rotas (`_app.agenda.index.tsx` e `_app.agenda.fotos.tsx`) renderizam o mesmo componente `AgendaTimeline`.
- `useAgenda` ordena todos os eventos de forma crescente por data (`a.inicio.localeCompare(b.inicio)`), ou seja, o mais antigo primeiro.
- `AgendaTimeline` já agrupa por dia com buckets (hoje / futuro / passado), mas não há separação visual entre blocos: quando não existem eventos de hoje ou futuros, o topo da tela mostra diretamente o histórico (como nas capturas enviadas), passando a impressão de que os eventos antigos vêm primeiro.

## Mudanças propostas

### 1. Ordenação base (`src/hooks/useAgenda.ts`)
Manter a lista filtrada ordenada, mas de forma consistente com a exibição: futuros/hoje em ordem crescente e passados em ordem decrescente, para que a timeline não dependa de reordenações extras.

### 2. Timeline em três seções (`src/components/agenda/AgendaTimeline.tsx`)
Reestruturar a renderização em blocos explícitos, nesta ordem:

```text
HOJE            → eventos do dia atual (crescente por horário)
PRÓXIMOS        → dias futuros, crescente (dia e horário)
HISTÓRICO       → dias passados, decrescente (mais recente primeiro)
```

- Cada bloco recebe um cabeçalho próprio (sticky), com contagem de eventos.
- Se "Hoje" e "Próximos" estiverem vazios, exibir uma linha curta de estado vazio ("Nenhum compromisso hoje / nada agendado à frente") antes do histórico, para que a leitura comece sempre pelo que é atual.
- O bloco Histórico ganha separação visual clara (divisor + rótulo) e continua paginado apenas por scroll.

### 3. Aplicar às duas agendas
Nada a duplicar: como as duas rotas usam `AgendaTimeline`, a reorganização vale para compromissos e para fotos automaticamente. Validação visual nas duas telas após a mudança.

## Fora de escopo

Sem alterações em filtros, permissões/RLS, sincronização com Google Agenda ou no conteúdo dos cards.
