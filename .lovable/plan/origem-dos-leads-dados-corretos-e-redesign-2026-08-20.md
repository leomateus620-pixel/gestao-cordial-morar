# Origem dos leads — dados corretos e redesign

## Por que só aparecem 4

O card hoje lê a tabela de **clientes** (52 registros no total, poucos no mês atual), não os **atendimentos**. Hoje existem 243 atendimentos com origem preenchida:

```text
WhatsApp    196
Site         25
Instagram    18
Presencial    2
Indicação     2
```

A troca da fonte de dados para atendimentos já resolve o número incompleto.

## O que muda

1. **Fonte de dados real**
   - Passa a agregar a origem dos **atendimentos** (mesma lista já usada no módulo Atendimentos), respeitando a imobiliária ativa (Cordial/Morar) e a permissão do usuário (corretor vê os seus, admin/secretária veem todos).
   - Atualização automática: mesma chave de cache dos atendimentos, então criar/editar um atendimento reflete no gráfico na hora.
   - Origens sem registro no período não poluem o gráfico; origem vazia entra como "Não informado".

2. **Filtros em um único ícone**
   - Botão de ícone (sliders) no canto do cabeçalho: popover no desktop, sheet no mobile.
   - Filtros disponíveis: período (Semana / Mês / 90 dias / Ano / Personalizado), imobiliária (Todas / Cordial / Morar), fonte de prospecção (Todas / Lead da imobiliária / Cliente particular) e corretor (para admin/secretária).
   - Indicador discreto no botão quando há filtro diferente do padrão.

3. **Menos texto**
   - Removidos: subtítulo "Distribuição dos contatos por canal...", frase de insight ("WhatsApp lidera..."), chips de eyebrow e descrições secundárias das linhas de canal.
   - Sobram: título, total no centro do donut e a lista de canais com valor e percentual.

4. **Título com destaque**
   - "Origem dos leads" vira o elemento dominante: tipografia maior, peso alto, tracking negativo e filete de acento na cor do canal líder — no lugar do bloco de rótulos atual.

5. **Ícones por canal**
   - Cada origem ganha ícone próprio em pastilha na cor do canal: WhatsApp, Instagram, Site (globo), Portais, Indicação, Presencial, Outros.
   - Lista de canais compacta: ícone + nome + valor tabular + barra fina de participação.

6. **Visual e responsividade**
   - Donut mais limpo (sem glow/sector exagerado), realce apenas no canal em foco.
   - Desktop: donut e lista lado a lado aproveitando a largura. Mobile: donut acima, lista abaixo, cabeçalho em duas linhas com o ícone de filtro.

## Detalhes técnicos

- `src/components/dashboard/LeadOriginCard.tsx`: troca `listClients`/`CLIENTS_QUERY_KEY` por `useAttendances` (atendimentos já filtrados por RLS/escopo), agregando por `origem` com `atendimentoOrigemOptions`/`atendimentoOrigemLabel` de `src/types/atendimento.ts`.
- Filtros com `Popover` + `Sheet` e `useIsMobile()`, mesmo padrão de `TeamPerformanceChart.tsx`.
- Cores continuam vindas de `@/lib/chart-palette`; ícones do `lucide-react`.
- Sem migração de banco, sem alteração em RLS, hooks ou server functions.
