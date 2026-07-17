## Diagnóstico

Verifiquei o formulário de aluguéis (`RentalFormModal.tsx`) e o backend (`rentals.functions.ts`). O problema do CPF/CNPJ na seção **Garantias** tem causa única e clara:

1. O formulário de **fiador** só possui campos para Nome, Telefone, E-mail e Vínculo — **não existe input de CPF/CNPJ** na UI.
2. A função `guaranteeEntryToInput` envia `cpfCnpj: null` fixo no payload do fiador, então mesmo se o usuário digitasse, o valor nunca chegaria ao banco.
3. Ao abrir o modal em modo de edição (`applyInitial`), o `cpfCnpj` do fiador existente **não é pré-carregado** no `GuaranteeEntry`, portanto não há como visualizar/corrigir.
4. O tipo `GuaranteeEntry` não tem o campo `guarCpfCnpj`.

Observação: o **locatário** já tem campo de CPF/CNPJ na UI, no payload (`tenantDataFromEntry`) e no backend (`tenantPayload → cpf_cnpj`). Se o usuário reportou que o CPF do locatário também não persiste, é provável que esteja preenchendo apenas em modo `existing` sem ativar "Editar dados" — nesse caso `tenantEntryToInput` envia apenas `{ existingId }` e ignora `data`. Sem mudança de código nesse ponto, o comportamento é o especificado. A correção principal aqui é para fiador; para locatário o fluxo já funciona quando "Editar dados" está ativo.

## Mudanças (apenas frontend, `src/components/alugueis/RentalFormModal.tsx`)

1. **`GuaranteeEntry`**: adicionar campo `guarCpfCnpj: string`.
2. **`newGuaranteeEntry()`**: inicializar `guarCpfCnpj: ""`.
3. **`guaranteeEntryToInput()`**: passar `cpfCnpj: g.guarCpfCnpj || null` (removendo o `null` hardcoded).
4. **`applyInitial` (prefill em edição)**: mapear `guarCpfCnpj: g.guarantor?.cpfCnpj ?? ""`.
5. **UI do fiador**: adicionar um `<Field label="CPF / CNPJ">` com input controlado por `g.guarCpfCnpj`, seguindo o mesmo padrão dos demais campos (Telefone/E-mail).

Backend (`rentals.functions.ts`) já suporta `cpfCnpj` do fiador via `guarantorPayload` tanto no INSERT quanto no UPDATE (quando `existingId + data` vêm juntos, graças à mudança anterior). Nenhuma migração ou mudança de tipo é necessária — `RentalGuarantorInput.cpfCnpj` já existe em `src/types/rental.ts`.

## Fora de escopo

- Não redesenhar o modal nem mexer no fluxo de locatário (já funciona quando "Editar dados" está ativo).
- Não alterar schema, RLS ou policies.
- Não mexer em outros módulos.
