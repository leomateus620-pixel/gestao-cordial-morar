## Problema

No menu **Vendas**, ao anexar arquivos no cadastro/edição, apenas o **Contrato** fica acessível (botão "Abrir contrato" no drawer). Os demais anexos ("Documentos auxiliares" — certidões, recibos etc.) mostram apenas o **nome do arquivo**, sem opção de abrir. Investigando o código:

- `SaleForm.tsx` coleta o `supportingFile` normalmente.
- `_app.vendas.tsx` → `handleSubmit`: quando existe `files.support`, apenas grava `supportingDocumentFileName` — **nunca chama `uploadSaleDocument` para o arquivo auxiliar**. O `File` é descartado.
- No banco, `sales.supporting_document_file_name` guarda só o nome; não há coluna/rota de storage para esse anexo.
- Além disso, o formulário aceita apenas **um** documento auxiliar, o que é limitante.

## Solução

Transformar os anexos de vendas em uma lista aberta (0..N), reutilizando o mesmo bucket `sale-documents` e o mesmo padrão já usado em `rental_contract_documents`. Contrato principal continua com o campo dedicado (`contract_file_path`), mas todos os demais anexos passam a ser persistidos como registros individuais com URL assinada.

### Backend (migração)

Criar tabela `public.sale_documents`:
- `id`, `sale_id` (FK → `sales`, cascade delete), `file_path` (unique), `file_name`, `mime_type`, `size_bytes`, `uploaded_by`, `created_at`.
- GRANTs para `authenticated` / `service_role`.
- RLS: SELECT/INSERT/UPDATE/DELETE espelhando as políticas de `sales` (owner, admin, secretaria). Consultas via `EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND <policy da sale>)`.
- Trigger opcional para remover objeto do storage quando a linha for deletada (usar `net.http`? — mais simples: deletar na server function, sem trigger).

Manter `supporting_document_file_name` por retrocompatibilidade (leitura), mas parar de escrever nele. Fazer backfill: nenhum (nome sem path é irrecuperável — apenas surgir como "sem arquivo" no legado, pois nunca foi enviado).

### Server functions (`src/lib/sales/sales.functions.ts`)

- Incluir `documents: SaleDocument[]` no `mapSaleRow` (join `sale_documents`).
- `getSaleDocumentSignedUrl` já existe — passa a servir qualquer path (contrato ou anexo) contanto que pertença a uma venda visível.
- Nova função `addSaleDocument({ saleId, path, fileName, mimeType, sizeBytes })` para registrar linha após upload client-side.
- Nova função `removeSaleDocument({ documentId })` que apaga do storage + linha.
- `deleteSale`: também remover todos os arquivos de `sale_documents` (loop `storage.remove`).

### Frontend

**`src/types/sale.ts`**
- Novo tipo `SaleAttachment { id, saleId, fileName, filePath, mimeType?, sizeBytes?, createdAt }`.
- `SaleRecord` ganha `attachments: SaleAttachment[]`.

**`src/hooks/useSales.ts`**
- Expor `addAttachment`, `removeAttachment`, `openAttachment` (reusa `signUrl`).

**`src/components/vendas/SaleForm.tsx`**
- Substituir bloco "Documento auxiliar" por lista dinâmica de anexos:
  - Botão "Adicionar anexo" (aceita múltiplos arquivos).
  - Cada item mostra nome + tamanho + botão remover.
  - Uploads pendentes ficam em estado local e são enviados no submit.
- `onSubmit` agora recebe `{ contract?: File; newAttachments: File[]; removedAttachmentIds: string[] }`.

**`src/routes/_app.vendas.tsx` (`handleSubmit`)**
- Após criar/atualizar a venda, iterar `newAttachments`: `uploadSaleDocument(file, saleId)` → `addAttachment({ saleId, path, ... })`.
- Iterar `removedAttachmentIds` → `removeAttachment`.
- Remover a lógica antiga de `supportingDocumentFileName`.

**`src/components/vendas/SaleDetailsDrawer.tsx`**
- Painel "Documentos" passa a listar:
  - Contrato (comportamento atual).
  - Lista de anexos com botão "Abrir" (chama `openContract`/`openAttachment` com o path — mesma signed URL).
- Se não houver nenhum anexo, mostrar estado vazio.

### Validação

1. Login como admin: editar uma venda existente, adicionar 2 anexos + trocar contrato → salvar → reabrir drawer → clicar "Abrir" em cada anexo (contrato + auxiliares) → URL assinada abre em nova aba.
2. Login como corretor dono da venda: mesmos passos, restrito à sua venda.
3. Remover um anexo → confirmar que sumiu do drawer e do bucket.
4. Excluir venda → confirmar que arquivos foram removidos do storage.
5. Rodar `supabase--linter` após migração.

## Detalhes técnicos (schema)

```sql
CREATE TABLE public.sale_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_documents TO authenticated;
GRANT ALL ON public.sale_documents TO service_role;
ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;
-- policies: EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND (s.owner_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'secretaria')))
CREATE INDEX ON public.sale_documents (sale_id);
```

Sem alteração em buckets — `sale-documents` (privado) já existe e o padrão de path `{userId}/{saleId}/{ts}-{name}` é mantido.