## Adicionar telefone do proprietário no cadastro de Aluguéis

### Objetivo
Incluir um campo "Telefone/Celular" na seção "Proprietário do imóvel" no cadastro/edição de aluguéis, com persistência no banco.

### Alterações

1. **Banco de dados** (migration)
   - Adicionar coluna `proprietario_telefone TEXT` em `public.rental_properties`.

2. **Types** (`src/types/rental.ts`)
   - Adicionar `proprietarioTelefone?: string | null` em `RentalProperty`.

3. **Backend** (`src/lib/rentals/rentals.functions.ts`)
   - Mapear `proprietario_telefone` ↔ `proprietarioTelefone` no select, insert, update e replace do imóvel.

4. **Formulário** (`src/components/alugueis/RentalFormModal.tsx`)
   - Adicionar input "Telefone / Celular" ao lado dos demais campos do proprietário (nome, CPF, e-mail).
   - Incluir no estado inicial, carregar em modo edição e enviar no payload.

5. **Visualização** (`src/components/alugueis/RentalExpandedDetails.tsx`)
   - Exibir o telefone junto aos demais dados do proprietário quando presente.

### Validação
- Cadastrar novo aluguel com telefone → verificar persistência.
- Editar contrato existente adicionando/alterando telefone → verificar salvamento e exibição.
