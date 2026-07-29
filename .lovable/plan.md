## Objetivo

Adicionar "Comissão mensal" ao módulo Aluguéis: campo no cadastro e na edição, com percentual calculado automaticamente em relação ao valor mensal, e dois novos cards ao lado de "Receita mensal".

## 1. Banco de dados

Nova migração em `rental_contracts`:
- coluna `comissao_mensal numeric` (opcional, sem valor padrão obrigatório).

Sem mudança de RLS: o acesso já é controlado pelas políticas existentes da tabela.

## 2. Backend (`src/lib/rentals/rentals.functions.ts`)

- Ler `comissao_mensal` nas consultas de contratos e mapear para `comissaoMensal`.
- Gravar em criação, edição e substituição de contrato (mesmos pontos onde `valor_mensal` é tratado).
- KPIs: somar `comissao_mensal` dos contratos ativos → `comissaoMensalAtiva`, e calcular `comissaoPercentualMedio = comissão total / receita mensal ativa × 100` (0 quando não há receita).

## 3. Tipos (`src/types/rental.ts`)

- `RentalContract.comissaoMensal?: number | null` e o campo correspondente em `RentalContractInput`.
- `RentalKpis` ganha `comissaoMensalAtiva` e `comissaoPercentualMedio`.

## 4. Formulário (`RentalFormModal.tsx`)

- Novo campo "Comissão mensal (R$)" ao lado de "Valor mensal", usando o mesmo parser pt-BR já existente (`parseBRLNumber`), evitando o bug de "1.500,00".
- Ao lado do campo, badge em tempo real com a porcentagem calculada: `comissão / valor mensal × 100`, exibida com 2 casas (ex.: "8,00% do valor mensal"). Fica oculta enquanto valor mensal for zero/vazio.
- Ao abrir em modo edição, o campo é pré-preenchido com o valor salvo.

## 5. Exibição

- `RentalKpiCards.tsx`: dois cards novos logo após "Receita mensal" — "Comissão mensal" (valor em R$) e "% comissão" (percentual). Ambos respeitam a mesma permissão financeira já usada por "Receita mensal" (`canViewFinancialInsights`), e o grid passa de 6 para 8 colunas em telas grandes.
- `useRentals.ts`: os KPIs contextuais (quando há filtro de corretor/período/imobiliária) também calculam comissão e percentual a partir dos contratos filtrados.
- `RentalExpandedDetails.tsx` e `RentalCard.tsx`: mostrar "Comissão mensal" com o percentual ao lado, junto do valor mensal.

## Detalhes técnicos

- Percentual sempre derivado (nunca persistido), garantindo consistência quando o valor mensal muda.
- Contratos antigos sem comissão contam como 0 nos KPIs e não exibem o percentual.
