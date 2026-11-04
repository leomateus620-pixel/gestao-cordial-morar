# Recibo — Água e outros acréscimos com descritivo

Escopo: somente Aluguéis → Emissões → Emitir recibo. Fórmulas, `computeReceiptTotals`, formato de `valores`, NFS-e, boleto, sync ImobiBrasil e previewAuthStorage não mudam. Nada publicado.

## 1. Seção renomeada + atalhos
- `ReceiptModal.tsx`: "Descontos e ajustes do inquilino" → **"Acréscimos e descontos do inquilino"**.
- Novo `src/lib/rentals/receipt-presets.ts` com `RECEIPT_ADJUSTMENT_PRESETS` (inquilino: Água, Fundo de reserva, Multa/Juros por atraso, Outro acréscimo; proprietário: Reparo/Manutenção) e `adjustmentFromPreset(id)` com os defaults pedidos (tipo, descrição, repassar, repetir, campo a focar).
- Chips acima de "+ Adicionar" em cada lado; criam item novo editável e focam valor (ou descrição em "Outro acréscimo"). Respeitam o limite de 10 itens.

## 2. Descrição até 120 caracteres
- Constante `MAX_ADJUSTMENT_DESCRIPTION = 120` em `receipt-model.ts`, usada em `validateReceiptAdjustments` (linha hoje com 60).
- `receipt-registration.ts`: só os campos `descricao` dos ajustes passam a 120 (o `text` max 60 segue para os demais campos).
- `emissions.functions.ts` `upsertContractAdjustment`: max 120.
- Campo com contador "n/120" e placeholder "Ex.: Água ref. set/2026 – leitura 125 m³".
- Migração aditiva mínima: apenas DROP/ADD do CHECK de `rental_contract_adjustments.descricao` para 1–120.
- `receipt-pdf.ts`: descrição de ajuste quebra em até 2 linhas (reticências se exceder), e a altura extra entra no cálculo de linhas disponíveis da via; agrupamento "Outros ajustes (n)" mantido; 3 vias em 1 página.

## 3. Encerrar recorrência
- Item com selo "Recorrente" ganha botão "Encerrar recorrência" com confirmação ("O item deixa de aparecer nos próximos recibos. Continuar?").
- Chama `deactivateContractAdjustment`, invalida `rental-contract-adjustments` e retira o item do recibo atual; em erro, mensagem e item mantido. "Remover só deste mês" continua igual.

## 4. Testes (`receipt-model.vitest.ts`)
- Defaults de cada preset.
- Água: aluguel 1.100,00, honorários 100,00, água 85,00 não repassada → inquilino 1.185,00 / proprietário 1.000,00.
- Descrição 120 aceita / 121 rejeitada (cliente e `checkReceiptValores`).
- PDF com 6 itens por lado de 120 caracteres → 1 página sem erro.
- Recorrência desativada não aparece em `activeRecurringFor`/`defaultReceiptInput` da competência seguinte.
- Suíte completa `bun run test` verde (168 atuais + novos).

## Observação fora do escopo (só aviso)
A regra salva de recibos pede fontes 9–10pt; o PDF hoje usa 8–8,5pt em telefone, site, CNPJ e rótulo da via. Não será alterado neste plano, salvo pedido.
