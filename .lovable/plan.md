# Correção da data de agenciamento (dia 1 aparecendo como dia anterior)

## Objetivo
Datas de agenciamento (ex.: Morar 3394 / Cordial 1395, 01/10/2026) devem aparecer e contar no dia e no mês certos em todas as telas, filtros, painéis, PDF e busca. Novos cadastros devem gravar a data de hoje no horário de Brasília.

## O que muda
1. Novo `src/lib/dates.ts` com funções simples (sem dependências):
   - `todaySaoPauloKey()`: AAAA-MM-DD em America/Sao_Paulo (Intl).
   - `parseDateOnlyLocal(key)`: `new Date(y, m-1, d)`.
   - `formatDateOnlyBR(key, "short" | "full")`: "01 de out." / "01/10/2026", montado sem passar por UTC.
   - `dateOnlyKey(value)`: string AAAA-MM-DD fica como está; timestamp vira a data em São Paulo (usa o `toSaoPauloDateKey` que já existe).
2. `src/services/agenciamentos.ts` `matchesPeriod`: compara chaves AAAA-MM-DD com início e fim do período calculados em São Paulo ("mes", "trimestre", "ano", "personalizado"), seguindo o padrão de `services/corretores.ts`. Corrige lista, `summary.mes` e card "Captações do mês".
3. `src/lib/agenciamentos/track.ts` `isSameMonth`: `dateOnlyKey(item).slice(0,7)` contra o mês de referência em São Paulo (fica igual ao `agenciamento_bonus_recalc` do banco).
4. `AgenciamentoCard.tsx` (linha 242), `AgenciamentoDetailDrawer.tsx` (linha 170) e `AgenciamentoPrintReport.tsx` (`formatFullDate` para a data de agenciamento): passam a usar `formatDateOnlyBR`. `shortDate` continua para criado/atualizado/validado.
5. `src/lib/busca/busca.server.ts:502`: usar `${data_agenciamento}T12:00:00-03:00`, no mesmo padrão da linha 829.
6. Gravação:
   - `property-link.functions.ts`: valor padrão vira `todaySaoPauloKey()`; no update idempotente, `data_agenciamento` existente **não** é sobrescrita.
   - `AgenciamentoFormModal.tsx` `toDateInput`: novo registro usa `todaySaoPauloKey()`; registro existente devolve a string AAAA-MM-DD sem conversão.

Não mexer: `reports.ts`, `corretores.ts`, `equipe.functions.ts`, `format.ts` (só se for necessário).

## Testes (TZ=America/Sao_Paulo; novos incluídos no script `test`)
- `src/lib/dates.test.ts`: "2026-10-01" → "01 de out." e "01/10/2026"; `todaySaoPauloKey` às 21:30 BRT de 01/10 → 2026-10-01.
- `agenciamentos-periodo.test.ts` (referência 02/10/2026): "2026-10-01" entra em "mes" e "trimestre"; personalizado 01/10–31/10 inclui e 01/09–30/09 exclui; testes atuais com timestamp continuam passando.
- `bonus-progress.test.ts`: item "2026-10-01" conta em outubro, não em setembro.
- Rodar a suíte completa e a checagem de tipos.

## Validação no preview (sem publicar)
- 3394/1395: card, cabeçalho do modal e PDF mostram 01/10.
- "Este mês", "Trimestre" e personalizado 01/10–31/10 incluem o 3394.
- "Captações do mês" e bonificação de Venda contam o 3394 em outubro.
- 3339/1343 e 3338/1342 aparecem em 01/09.
- Cadastro de imóvel de teste: só se o Leonardo autorizar a gravação; conferir `data_agenciamento` = hoje em BRT. Sem autorização, a conferência fica nos testes automáticos.

## Dados
Nenhum UPDATE de datas. Só uma consulta de leitura para conferir de novo; se aparecer registro gravado errado, listar (código, data atual, data sugerida) para decisão um a um.
