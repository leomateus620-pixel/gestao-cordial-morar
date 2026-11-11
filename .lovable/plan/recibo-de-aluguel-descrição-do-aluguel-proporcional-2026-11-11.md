# Recibo de aluguel: descrição do aluguel (proporcional)

Confirmei no código: `observacao` aparece só na via 0 (`receiptViaRows`), o limite 160 está como número solto em `buildReceiptModel` e `receiptValoresSchema`, e só as linhas de ajuste quebram no PDF (`labelLines`/`adjLabels`). As linhas base usam `draw`, que reduz a fonte.

## Decisão de dados
Vou reutilizar `valores.observacao`, sem migração e sem coluna nova. Concordo com isso: o campo já é gravado e validado, e nenhum relatório lê esse valor hoje. Se um dia houver relatório, ele pode ler o jsonb. Recibos antigos continuam válidos.

## Arquivos e funções
- `src/lib/rentals/receipt-model.ts`
  - `export const MAX_RENT_DESCRIPTION = 160`, usado no modelo, na UI e no schema.
  - `buildReceiptModel`: aplica trim em `observacao`. Só espaços vira "". Acima de 160 continua dando o mesmo erro.
  - `receiptViaRows` devolve a linha do aluguel com nota: `ReceiptRow = [label, value, note?]`. O formato é uma tupla com um terceiro elemento opcional, então quem lê as linhas hoje continua funcionando. A linha fica `["Aluguel", aluguel, descricao || undefined]` nas vias 0, 1 e 2. PDF e prévia leem essa mesma fonte.
- `src/lib/rentals/receipt-proportional.ts` (novo, puro)
  - `daysInCompetence(competencia)`.
  - `computeProportionalRent({ valorMensal, competencia, tipo: "entrada" | "saida", data?, dias? })` devolve `{ dias, diasMes, valor, descricao }` ou um erro.
  - Contagem inclusiva: entrada no dia D dá último dia − D + 1, saída no dia D dá D.
  - O valor é calculado em centavos inteiros: `round(cents × dias / diasMes)`, meio para cima.
  - Texto: "referente aos N dias morados em outubro". Com 1 dia, "referente a 1 dia morado em …".
- `src/lib/rentals/receipt-registration.ts`: `observacao: z.string().max(MAX_RENT_DESCRIPTION)`, com o mesmo comportamento, `.strict()` mantido.
- `src/lib/rentals/receipt-pdf.ts`: veja a seção do layout abaixo.
- `src/components/alugueis/ReceiptModal.tsx`
  - Tiro o campo de "Dados do recibo".
  - Em "Valores do mês", logo abaixo de Aluguel (`sm:col-span-2`), entra uma caixa de texto com:
    - rótulo "Descrição do aluguel (opcional)";
    - contador `n/160`, placeholder, aria-label próprio e o texto de ajuda pedido.
  - Botão pequeno secundário "Calcular proporcional", que abre um painel na própria tela. O painel tem:
    - Tipo (Entrada/Saída);
    - Data, pré-preenchida com `dataInicio` ou `dataEncerramento ?? dataFim` só quando cair na competência;
    - Dias morados, editável;
    - a prévia "R$ X · referente aos …";
    - a nota sobre os honorários;
    - o botão "Usar estes valores", que é o único que preenche Aluguel e Descrição.
  - Mensagens para data fora da competência e para dias fora de 1..diasMes.
  - "Prévia das vias": a nota aparece abaixo de "Aluguel" nas duas colunas (`text-xs text-muted-foreground`, `whitespace-normal break-words`).

## Layout do PDF
- Linha "Aluguel": continua igual (x e valor atuais).
- Nota:
  - `wrapWith(clean(nota), 258, font)` em fonte 8, x = 46, mesma tinta, sem reduzir a fonte;
  - no máximo 3 linhas; se passar, a 3ª é cortada com "…" até caber em 258;
  - cada linha da nota usa o mesmo passo vertical das linhas de ajuste quebradas.
- `fitReceiptRows`: o `linesOf` passa a receber a linha inteira. A linha do aluguel conta 1 + linhas da nota, e assim "Outros ajustes (n)" continua com a soma certa e cabe na área.
- Sem nota: as mesmas chamadas e posições de hoje, então o PDF sai idêntico.
- Não mudam: totais, honorários, repasse, cabeçalho, título e rodapé.

## Testes (`receipt-model.vitest.ts` + novo `receipt-proportional.vitest.ts`)
1. Sem descrição, as linhas das 3 vias ficam iguais às de hoje. Com descrição, ela aparece em 0, 1 e 2. Um recibo antigo com `observacao` passa no schema.
2. 160 passa, 161 é rejeitado no modelo e no schema. Só espaços conta como vazio.
3. PDF:
   - 160 caracteres ficam em no máximo 3 linhas de fonte 8;
   - 160 caracteres + 10 ajustes por lado mantêm "Outros ajustes (n)" com soma correta e dentro da área;
   - `fitReceiptRows` com o `linesOf` do aluguel.
4. Proporcional:
   - entrada 06/10/2026 com 800,00 dá 26 dias e R$ 670,97;
   - saída 15/02/2026 (mês de 28 dias) e saída 15/02/2028 (29 dias);
   - entrada no dia 1 dá o valor cheio;
   - 0 ou mais dias que o mês dá erro;
   - textos no plural e no singular.
5. Regressão: rodo todos os testes atuais de recibo, mais typecheck e lint.

## Riscos
- Exemplo da funcionária: 670,96 vem de outro arredondamento ou de outro valor de aluguel. Pela regra pedida, 800 em outubro com 26 dias dá 670,97. O valor continua editável.
- Mudar o formato das linhas (terceiro elemento) pode afetar quem lê `receiptViaRows`. Hoje são só o PDF e o ReceiptModal; vou conferir com o typecheck.
- Recibos já emitidos não são regerados: os PDFs antigos ficam como estão.

## Observação à parte
Uma verificação automática encontrou uma diferença com uma regra que você pediu antes. A regra diz texto de 9–10pt no recibo, mas hoje o telefone sai em 8,5pt e o site, o CNPJ e a identificação da via saem em 8pt. A descrição em fonte 8 que você pediu agora também fica abaixo de 9pt. Vou manter como você pediu (8pt) e não mexer no cabeçalho, a menos que você peça.

Posso aplicar?
