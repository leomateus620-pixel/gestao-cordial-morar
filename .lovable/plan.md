## Plano

1. **Corrigir a interpretação das datas da planilha**
   - A aba `Jul26` tem datas no formato `1-jul.`, `2-jul.`, etc.
   - O importador atual só entende `dd/mm/aaaa`, ISO e serial, por isso está ignorando as linhas de Julho como “data inválida”.
   - Vou adicionar suporte aos formatos reais da planilha: `d-mmm.`, `dd-mmm`, `d/mmm`, com meses em português, inferindo o ano pela aba (`Jul26` → 2026).

2. **Ler a aba mensal usando o mês/ano da própria aba**
   - O parser passará a receber o nome da aba (`Jan26`…`Dez26`) para completar datas sem ano.
   - Isso evita que lançamentos de Julho sejam descartados quando a célula só mostra dia e mês.

3. **Melhorar a prévia e mensagens de erro**
   - A prévia deve mostrar as linhas de `Jul26` corretamente.
   - Os erros de importação vão indicar a aba e linha real, facilitando identificar qualquer linha que ainda não entre.

4. **Importar os lançamentos para o Financeiro**
   - Cada linha válida da aba mensal vira um lançamento em `financeiro_lancamentos`.
   - Entradas continuam vindo de valores positivos; saídas de valores negativos.
   - `Conta` continua indo para observações e define `Cordial`/`Morar`.
   - A deduplicação permanece por `planilha + aba + linha`, então reimportar não duplica.

5. **Validar no app**
   - Confirmar que a prévia encontra os dados de `Jul26`.
   - Confirmar que o menu Financeiro deixa de aparecer vazio após a importação.

## Detalhes técnicos

- Arquivo principal: `src/lib/financeiro/sheets.functions.ts`.
- Ajuste central: `parseDate` passará a aceitar datas renderizadas pelo Google Sheets como `1-jul.`.
- A chamada de importação passará o título da aba para o parser: `parseDate(dataRaw, tab)`.
- Não vou alterar a estrutura da planilha nem criar sincronização automática; o botão **Importar agora** continuará sendo o gatilho de atualização.