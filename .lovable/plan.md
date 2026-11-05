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

## Fase 4 — Recibo já emitido (proposta, aguarda OK separado)
Hoje não há bloqueio de duplicidade: a tabela não tem unicidade por contrato/competência e a lista mostra todas as emissões da competência (mais recente primeiro). Portanto, já é possível emitir um novo recibo out/2026 correto sem migração.

Proposta para este ciclo:
- Botão "Reemitir/substituir" em cada recibo emitido: abre o modal pré-preenchido com os `valores` gravados; ao emitir, cria nova emissão e marca a anterior como substituída.
- Migração somente aditiva (não será aplicada sem sua aprovação):
```sql
ALTER TABLE public.rental_emissions
  ADD COLUMN substituida_por uuid REFERENCES public.rental_emissions(id) ON DELETE SET NULL,
  ADD COLUMN substituida_em timestamptz;
CREATE INDEX rental_emissions_substituida_por_idx ON public.rental_emissions (substituida_por);
```
- Marcação feita no servidor, só após a nova emissão registrar com sucesso, e somente se a anterior for do mesmo contrato, tipo recibo e ainda não substituída. Lista mostra "Substituído" na antiga; PDF antigo permanece acessível.
- Se preferir deixar fora deste ciclo: nada de migração; a equipe emite novo recibo da mesma competência e o mais recente aparece no topo.

## Testes (receipt-model.vitest.ts)
- Exemplo real: aluguel 2.200, honorários 200, fundo de reserva desconto 69,31 inquilino repassado → 2.130,69 / 1.930,69; linhas da via do locatário (as mesmas do PDF) contêm "Fundo de reserva" e "2.130,69".
- Mesmo item no proprietário → 2.200,00 / 1.930,69 e `suggestTenantSide` true; variações "FUNDO DE RESERVA", "fundo  de reserva"; "Reparo" → false.
- Mover para inquilino produz exatamente o caso do inquilino.
- Prévia e PDF usam a mesma função de linhas/totais.
- `bun run test:receipts`, `bun run test` e build sem erros.

## Arquivos
`receipt-presets.ts`, `receipt-model.ts`, `receipt-pdf.ts` (só extração das linhas), `ReceiptModal.tsx`, `receipt-model.vitest.ts`; Fase 4 também `emissions.functions.ts`, `receipt-registration.ts`, `RentalEmissions.tsx` e a migração.
