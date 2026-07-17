## Diagnóstico

Ao **editar um aluguel**, o formulário exibe apenas um dropdown para o "Locatário principal" (modo `existing`), sem campos editáveis. Consequência:

1. A **renda** (e demais dados: telefone, e-mail, CPF, profissão, endereço) do locatário **não pode ser corrigida** pela tela de edição do aluguel — o único jeito é criar um locatário novo.
2. Mesmo se os campos aparecessem, o backend (`createRentalContract` / `replaceRentalContract` em `src/lib/rentals/rentals.functions.ts`) hoje ignora `data` quando `existingId` é enviado — só faz o INSERT do locatário quando não há `existingId`. O mesmo vale para fiadores.

Ou seja, o bug da renda que ainda persiste não é de parsing (o `parseBRLNumber` já está correto) — é que a edição do locatário simplesmente não é persistida.

## Mudanças

### 1. `src/types/rental.ts`
- Em `RentalContractTenantInput`: permitir `existingId` **e** `data` juntos (edição de locatário existente).
- Em `RentalContractGuaranteeInput.guarantor`: idem.

### 2. `src/lib/rentals/rentals.functions.ts` (create e replace)
- Ao processar cada tenant: se vier `existingId` + `data`, executar `UPDATE rental_tenants SET ... WHERE id = existingId` (respeitando RLS) antes de vincular ao contrato.
- Mesma lógica para `rental_guarantors` quando `tipo === "fiador"` e vier `existingId` + `data`.
- Não alterar comportamento quando só vem `existingId` (sem `data`) ou só `data`.

### 3. `src/components/alugueis/RentalFormModal.tsx`
- No bloco de cada locatário em modo `existing`, adicionar um botão/toggle **"Editar dados do locatário"** que revela os mesmos campos de "Novo" (nome, telefone, e-mail, CPF, profissão, **renda com `parseBRLNumber`**, endereço) já pré-preenchidos.
- No submit, quando o toggle estiver ativo, enviar `{ existingId, data: { ... } }` para que o backend atualize.
- Ao abrir em modo edição do aluguel: manter `mode: "existing"` (não muda seleção), mas deixar os campos já disponíveis para revisão.
- Repetir o mesmo padrão para fiadores existentes.

### 4. Sem mudanças em UI de listagem/drawer
O `RentalExpandedDetails` já reflete os dados do locatário direto do banco, então as correções aparecem automaticamente após salvar.

## Fora de escopo
- Não redesenhar o formulário nem mexer em outros módulos.
- Não alterar policies/schema — apenas UPDATE em tabelas já existentes com RLS já configurada.