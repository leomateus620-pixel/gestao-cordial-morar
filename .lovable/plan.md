## O que a planilha realmente é

Planilha `Controle Financeiro - Cordial e Morar` (ID `1YjS6W8fWPa1cqXgq-dt0kotLDrjFgtkYSwMqBCUsZQ0`, timezone `America/Los_Angeles`, locale `pt_BR`). Estrutura real:

- **`Plano de Contas`** — cadastro de `Tipo`, `Categorias` e `Contas bancárias` (Sicredi Cordial, Sicredi Morar, etc.). Base de listas.
- **`Jan26`, `Fev26`, `Mar26`, `Abr26`, … Dez26`** — uma aba por mês. Cabeçalho na linha 1, colunas fixas:
  - `A` Data · `B` Conta · `C` Categoria · `D` Descrição · `E` Valor (positivo = entrada, negativo = saída, formato R$ pt-BR)
- **`2026 DRE`** — relatório de saída (receita, deduções, custos, etc.), preenchido por fórmula a partir das abas mensais.

**Estado hoje**: os cabeçalhos existem, mas as abas mensais estão vazias (só `Saldo inicial` na `Jan26`) e o DRE está zerado. Ou seja, "trazer os dados" hoje = importar 0 lançamentos. A integração precisa estar pronta para quando a equipe começar a preencher.

## Ajustes que farei no código

O importador atual (`src/lib/financeiro/sheets.functions.ts`) espera **uma única aba** com colunas `A..H` no formato antigo (`data, descricao, categoria, tipo, valor, imobiliaria, status, corretor_email`). Isso não bate com a planilha real. Vou refazer o mapeamento:

1. **Multi-aba automática** — descobrir todas as abas cujo título casa com `^[A-Z][a-z]{2}\d{2}$` (Jan26, Fev26, …) via `spreadsheets.get`. Cada aba é lida com range `A2:E1000`.
2. **Novo parser de linhas** — para cada linha:
   - `data`: aceita `dd/mm/aaaa`, `d/m/aa` e serial number do Sheets.
   - `conta` → grava em `observacoes` (prefixo `Conta: `) para não perder o dado; futuramente pode virar coluna própria.
   - `categoria` → `categoria`.
   - `descricao` → `descricao`.
   - `valor`: parse pt-BR (`1.234,56`, `-1.234,56`, `R$`, parênteses). Se `>= 0` vira `tipo=entrada`; se `< 0` vira `tipo=saida` com `valor = abs(valor)`.
   - `imobiliaria`: derivada da `Conta` (`contém "Cordial"` → `cordial`, `contém "Morar"` → `morar`, senão `ambas`).
   - `status`: `Pago` por padrão (a planilha é um livro-caixa realizado).
   - `corretor_id`: `null` (a planilha não tem essa informação).
3. **Deduplicação estável** — `origem = "sheets"`, `origem_id = "<spreadsheetId>::<sheetTitle>::<rowNumber>"`. Reimportações continuam fazendo upsert sem duplicar, e uma linha excluída na planilha simplesmente para de ser recriada (não some do banco — comportamento intencional; posso mudar depois se quiser hard-delete).
4. **Config pré-preenchida** — inserir/atualizar a linha singleton em `financeiro_sheet_config` com esse ID já apontando para a planilha certa. `sheetName`/`range`/`headerRow` viram apenas metadados exibidos na UI, porque o importador passa a varrer todas as abas mensais.
5. **Prévia (`previewSheetRows`)** — passa a mostrar a próxima aba com dados (Jan26 se tiver, senão a mais recente com linhas preenchidas) para você conferir mapeamento antes da importação real.
6. **Atualizar textos da UI** (`GoogleSheetsIntegration.tsx`) — a tabela "Formato esperado das colunas" ainda descreve o formato antigo `A..H`. Vou reescrever para refletir `Data · Conta · Categoria · Descrição · Valor` e explicar que cada aba `MesAA` é uma competência.

## Executar a importação

Depois do deploy dos ajustes acima:

7. Rodar `importSheetRows` uma vez (via UI em `Financeiro → Integrações` → **Importar agora**, ou eu chamo direto). Como a planilha está vazia, o resultado esperado é `0 inseridos / 0 atualizados / 0 ignorados`. Isso é o esperado — significa que a ponte funciona; assim que a equipe começar a lançar em `Jan26`, `Fev26`, etc., cada reimportação puxa o novo.
8. Confirmar via `supabase--read_query` em `financeiro_lancamentos` que nada foi inserido indevidamente e que a config em `financeiro_sheet_config` aponta para o ID novo.

## Fora do escopo agora

- **Sincronização automática** (webhook / cron). Continua manual pelo botão. Se quiser polling automático (ex.: a cada 15 min), pode ser um próximo passo.
- **Escrita reversa** (Lovable → planilha). Continua só leitura.
- **Puxar totais do `2026 DRE`**. O DRE é derivado; importar as linhas das abas mensais reproduz o mesmo cálculo no menu Financeiro, sem duplicar fonte da verdade.
- **Mapear `Conta` para uma coluna própria** no schema. Por ora vai em `observacoes` para não migrar. Se quiser coluna dedicada `conta_bancaria`, faço migration em rodada separada.

## O que vai mudar no menu Financeiro

Nada visual. Os KPIs, gráficos e listagens já leem de `financeiro_lancamentos`; conforme a planilha for preenchida e você clicar "Importar agora", os números aparecem automaticamente respeitando o seletor de imobiliária (Cordial / Morar / ambas), derivado da coluna `Conta`.
