## Objetivo
1. Corrigir o bug onde valores digitados (ex.: `1500,00`) são salvos como `2` no cadastro/edição de aluguéis.
2. Permitir editar contratos já cadastrados a partir do drawer de detalhes.

## Diagnóstico do bug de valor
O campo "Valor mensal" em `RentalFormModal.tsx` (linha 870) usa `<input type="number">`. Quando a usuária digita no formato pt-BR (`1.500,00` ou `1500,00`), o navegador em locale não pt-BR interpreta o `.` como separador decimal (`1.500` → `1.5`) ou descarta o valor. Combinado com `step="0.01"` e a formatação `brl(...)` sem casas decimais, o resultado é exibido como `R$ 2` (arredondamento de `1.5` para `2`, ou outro artefato de parsing).

O mesmo problema existe nos campos "Valor caução" e "Seguro (mensal)".

## Correção do valor
- Trocar os inputs monetários por `<input type="text" inputMode="decimal">` com máscara/parse pt-BR:
  - Aceitar `1.500,00`, `1500,00`, `1500.00`, `1500`.
  - Função `parseBRLNumber(str)`: remove `R$`, espaços; se contém `,`, trata `.` como milhar e `,` como decimal; senão usa `.` como decimal.
  - Aplicar no submit para `valorMensal`, `valorCaucao`, `seguroValorMensal`, `renda`.
- Utilitário compartilhado em `src/lib/format.ts` (`parseBRLNumber`).
- Validar `Number.isFinite(valor) && valor > 0` antes de enviar, com mensagem clara em caso de erro.

## Edição de aluguéis existentes
- Refatorar `RentalFormModal` para aceitar prop opcional `initial?: RentalContractFull`:
  - Quando presente, pré-preencher todos os campos (imóvel, locatários, garantias, contrato) e trocar o título para "Editar aluguel".
  - No submit, se `initial` existir, chamar `updateRental` em vez de `createRental`.
- Estender `updateRentalContract` (server function) para também atualizar:
  - todos os locatários existentes (`rental_contract_tenants` + tabela `rental_tenants`),
  - todas as garantias existentes (`rental_contract_guarantors` + `rental_guarantors`),
  - permitir adicionar/remover itens nas listas (diff simples: reescrever join tables).
  - Manter compatibilidade com colunas legadas (tenant/guarantor "principal" = índice 0).
- Adicionar botão "Editar" no `RentalExpandedDetails.tsx` que fecha o drawer e abre o `RentalFormModal` em modo edição, passando o contrato selecionado.
- Ajustar `_app.alugueis.tsx` para orquestrar estado `editing: RentalContractFull | null` e passar ao modal.

## Arquivos afetados
- `src/lib/format.ts` — adicionar `parseBRLNumber`.
- `src/components/alugueis/RentalFormModal.tsx` — inputs monetários, prop `initial`, hidratação de estado, submit dual (create/update), título dinâmico.
- `src/components/alugueis/RentalExpandedDetails.tsx` — botão "Editar" + callback `onEdit`.
- `src/routes/_app.alugueis.tsx` — estado de edição e wiring.
- `src/lib/rentals/rentals.functions.ts` — expandir `updateRentalContract` para múltiplos locatários/garantias.
- `src/hooks/useRentals.ts` — expor `updateRental` já existente (verificar assinatura); ajustar se necessário.

## Fora do escopo
- Não altero design geral do modal nem do drawer.
- Não altero fluxo de documentos, pagamentos, encerramento ou renovação.