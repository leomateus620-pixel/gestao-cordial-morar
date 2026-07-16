## Anexo de contrato de locação (Aluguéis)

Adicionar campo para anexar arquivos do contrato de locação (PDF/imagens), salvando no bucket do backend e listando os anexos no painel de detalhes do aluguel.

### 1. Backend (Cloud)

- Criar bucket privado `rental-documents` (via tool de storage).
- Nova tabela `rental_contract_documents`:
  - `contract_id` (FK → `rental_contracts`), `file_path`, `file_name`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at`.
  - RLS: leitura/inserção/deleção para usuários autenticados que possam acessar o contrato (created_by, admin) — seguindo o padrão das demais tabelas de aluguel.
  - GRANTs padrão (`authenticated`, `service_role`).
- Políticas em `storage.objects` para o bucket `rental-documents` (apenas usuários autenticados; caminho prefixado por `<contract_id>/`).

### 2. Server functions (`src/lib/rentals/rentals.functions.ts`)

- `listRentalContractDocuments({ contractId })` — lista metadados + signed URL (60 min) para preview/download.
- `uploadRentalContractDocument({ contractId, fileName, mimeType, base64 })` — grava no bucket em `rental_contract_documents/<contractId>/<uuid>-<fileName>` e insere linha de metadados.
- `deleteRentalContractDocument({ id })` — remove do bucket e da tabela.

### 3. Tipos (`src/types/rental.ts`)

- Novo `RentalContractDocument` (`id`, `contractId`, `fileName`, `mimeType`, `sizeBytes`, `url`, `createdAt`).

### 4. Hook `src/hooks/useRentals.ts`

- Expor `useContractDocuments(contractId)` (query) + mutations `uploadDocument` / `deleteDocument` com invalidação da chave `["rentals","documents", contractId]`.

### 5. UI

- **`RentalFormModal.tsx`**: nova seção "Documentos" (opcional) com input de upload múltiplo. Após criar o contrato, subir os arquivos selecionados e associá-los.
- **`RentalExpandedDetails.tsx`**: nova seção "Documentos do contrato" listando arquivos com nome, tamanho, ícone por tipo, botão "Abrir" (signed URL, `target=_blank`) e "Excluir". Preview inline de imagens (thumb) e ícone PDF. Botão "Adicionar arquivo" (input file) que dispara upload direto para o contrato existente.

### 6. Validações

- Aceitar PDF, PNG, JPG, WEBP, DOC/DOCX.
- Limite 10 MB por arquivo (validado no cliente e no server function).

### Observações técnicas

- Upload feito via server function (base64 → `supabase.storage.from(...).upload`) para manter RLS/regra centralizada; arquivos > 6MB continuam viáveis nesse fluxo mas ficam próximos do limite prático de payload — se necessário posteriormente, migrar para signed upload URL. Para o escopo atual (contratos de locação), 10 MB é suficiente.
- Nenhuma mudança em outras telas.
