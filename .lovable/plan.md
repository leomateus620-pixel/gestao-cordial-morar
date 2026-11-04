# Recibo: mostrar centavos e melhorar a tela de emissão

## Causa confirmada
- O PDF já mostra centavos (usa formato próprio com 2 casas).
- A tela "Emitir recibo" e os cards de Emissões usam o formato geral de dinheiro do sistema, que arredonda para reais inteiros. Por isso R$ 919,44 aparece como "R$ 919" e R$ 827,49 como "R$ 827".
- O cálculo dos totais está certo (em centavos); só a exibição corta.

## O que muda
1. **Centavos sempre visíveis** na tela do recibo (totais e resumo) e nos valores dos cards de Emissões e "Aluguel mensal" do contrato: R$ 919,44, R$ 0,00.
   - O formato geral do resto do sistema (painéis, relatórios) não muda.
2. **Campos de valor em reais**: entrada com prefixo "R$", vírgula brasileira, exibindo 2 casas ao sair do campo (ex.: "0" vira "0,00"); sem setas de número; teclado numérico no celular.
3. **Organização da tela** em blocos:
   - Valores: Aluguel, Condomínio, IPTU (+ parcela x/y ao lado), Seguro fiança.
   - Descontos da administração: Honorários.
   - Dados: Vencimento e Observação de proporcional.
4. **Resumo claro** no rodapé, com contas visíveis:
   - Total a pagar (inquilino) = aluguel + condomínio + IPTU + seguro.
   - Total a receber (proprietário) = aluguel − honorários + condomínio.
   - Linhas com cada parcela e o total em destaque, iguais ao PDF.
5. Mensagens de erro ao lado do campo inválido (valor negativo ou vazio).

Nenhuma regra de cálculo, PDF, NFS-e ou boleto é alterada.

## Detalhes técnicos
- Novo `brlCents` em `src/lib/format.ts` (minimumFractionDigits 2) — `brl` permanece igual.
- `ReceiptModal.tsx`: usar `brlCents`; componente `MoneyInput` local (text + inputMode="decimal", parse pt-BR para número, formata no blur); agrupar seções; resumo com `totals` do `buildReceiptModel`.
- `RentalEmissions.tsx` linha 167 e cabeçalho do contrato: `brlCents`.
- Teste: `brlCents(919.44) === "R$ 919,44"` e parse de "1.234,56" → 1234.56.
- Verificação na prévia: abrir o contrato Esquina Guia Lopes, digitar 919,44 / 91,95 e conferir R$ 919,44 e R$ 827,49.
