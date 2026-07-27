## Adicionar categoria "Apólice de Seguro Fiança" nos anexos de Aluguéis

### O que muda
Nova categoria de documento no módulo Aluguéis, ao lado de Contrato de aluguel, Termo de vistoria e Check-list aluguel, para anexar a apólice do seguro fiança.

### Alterações

1. **`src/types/rental.ts`**
   - Adicionar `"apolice_seguro_fianca"` ao tipo `RentalDocumentCategory`.
   - Adicionar a entrada correspondente em `RENTAL_DOCUMENT_CATEGORIES` (label: "Apólice de Seguro Fiança", descrição curta), posicionada logicamente antes de "Outros".

2. **Backend (migração Supabase)**
   - Atualizar o CHECK constraint da coluna `category` em `rental_contract_documents` para incluir o novo valor `apolice_seguro_fianca`, preservando os existentes.

3. **UI**
   - Nenhuma mudança estrutural: `RentalDocuments.tsx` já renderiza dinamicamente a partir de `RENTAL_DOCUMENT_CATEGORIES`, então o novo card "Apólice de Seguro Fiança" aparece automaticamente com botão Adicionar e listagem, seguindo o mesmo padrão visual dos demais.

### Fora do escopo
- Nenhuma alteração em RLS, storage, sincronização com Google Drive ou fluxo de upload — a nova categoria reutiliza toda a infraestrutura existente.
