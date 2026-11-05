# Recibo — desconto do inquilino na via certa + prévia das vias

Escopo: Aluguéis → Emissões → Emitir recibo. Sem publicar; sem tocar NFS-e, boleto, sync ImobiBrasil, previewAuthStorage, fontes do PDF nem dados existentes (incluindo a emissão 554b043b).

## Fase 1 — Seções inequívocas
- Inquilino: título "Acréscimos e descontos do inquilino", subtítulo "Afeta o que o inquilino paga (aparece na via do locatário)"; legenda do "Repassar ao proprietário": "também desconta/acrescenta no repasse ao proprietário".
- Proprietário: "Descontos só do proprietário (não aparecem para o inquilino)", aviso fixo com o texto pedido, botão "+ Adicionar desconto só do proprietário".
- Borda/fundo distintos por seção usando tokens do tema (inquilino: tom primário; proprietário: tom de alerta suave).

## Fase 2 — Proteção contra lado errado
- `suggestTenantSide(descricao)` em `receipt-presets.ts`: normaliza (minúsculas, sem acentos, espaços) e retorna true se contiver "fundo de reserva".
- No item do proprietário com descrição sugerida: aviso inline + botão "Mover para o inquilino (repassado ao proprietário)" → remove do lado do proprietário e cria item do inquilino tipo desconto, repassar ON, sem recorrência, mesma descrição/valor. Não bloqueia emissão.

## Fase 3 — Prévia das vias
- Bloco "Prévia" acima de Emitir, duas colunas (empilha no celular): Via do locatário (linhas + Total a pagar) e Via do proprietário (linhas + Total a receber).
- Linhas vêm do mesmo modelo do PDF: extrair de `receipt-pdf.ts` a montagem das linhas por via para uma função pura em `receipt-model.ts` (ex.: `receiptViaLines(model, via)`), usada pelo PDF e pela prévia — sem duplicar regra. Layout/fontes do PDF inalterados (recibo sem ajustes continua idêntico).

## Fora deste ciclo
Sem reemitir/substituir e sem nenhuma migração. Nenhum dado real alterado (emissão 554b043b intacta).

## Testes (receipt-model.vitest.ts)
- Exemplo real: aluguel 2.200, honorários 200, fundo de reserva desconto 69,31 inquilino repassado → 2.130,69 / 1.930,69; linhas da via do locatário (as mesmas do PDF) contêm "Fundo de reserva" e "2.130,69".
- Mesmo item no proprietário → 2.200,00 / 1.930,69 e `suggestTenantSide` true; variações "FUNDO DE RESERVA", "fundo  de reserva"; "Reparo" → false.
- Mover para inquilino produz exatamente o caso do inquilino.
- Prévia e PDF usam a mesma função de linhas/totais.
- `bun run test:receipts`, `bun run test` e build sem erros.

## Arquivos
`receipt-presets.ts`, `receipt-model.ts`, `receipt-pdf.ts` (só extração das linhas), `ReceiptModal.tsx`, `receipt-model.vitest.ts`. Sem migração.
