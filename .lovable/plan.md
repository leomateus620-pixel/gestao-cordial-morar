## Objetivo
Permitir anexar documentos maiores que 10 MB no menu **Aluguéis** (bucket `rental-documents`).

## Problema atual
O upload passa por uma server function (`uploadRentalContractDocument`) recebendo o arquivo em **base64**. Isso tem dois limites:
- `MAX_BYTES = 10 * 1024 * 1024` no cliente (`src/hooks/useRentalDocuments.ts`).
- `MAX_DOC_BYTES = 10 * 1024 * 1024` no servidor (`src/lib/rentals/rentals.functions.ts`).

Além disso, base64 inflaciona o payload em ~33% e trafega por uma serverless function — inadequado para arquivos grandes (PDFs escaneados, contratos com fotos, etc.).

## Abordagem
Trocar o caminho de upload por **upload direto ao Storage** usando o cliente Supabase autenticado do navegador, e usar a server function apenas para registrar a linha em `rental_contract_documents`. Assim o arquivo não passa pela server function e o limite prático fica sendo o do bucket/Storage, não do payload RPC.

## Alterações

### 1. `src/lib/rentals/rentals.functions.ts`
- Adicionar nova server function `registerRentalContractDocument` que recebe `{ contractId, fileName, filePath, mimeType, sizeBytes }` já com o arquivo enviado, valida ownership do contrato (igual às demais) e faz apenas o `insert` em `rental_contract_documents`.
- Manter `uploadRentalContractDocument` para compatibilidade, mas subir `MAX_DOC_BYTES` para **50 MB** (fallback caso alguém use o caminho antigo).

### 2. `src/hooks/useRentalDocuments.ts`
- Remover conversão base64 e chamada a `uploadRentalContractDocument`.
- Novo fluxo em `uploadFile(file)`:
  1. Obter `user.id` via `supabase.auth.getUser()`.
  2. Gerar `filePath = ${user.id}/${contractId}/${crypto.randomUUID()}-${sanitize(file.name)}`.
  3. `supabase.storage.from('rental-documents').upload(filePath, file, { contentType, upsert: false })`.
  4. Chamar `registerRentalContractDocument` com os metadados.
  5. Em caso de falha do insert, remover o objeto do Storage para não deixar órfão.
- Elevar limite para **50 MB** (`MAX_BYTES = 50 * 1024 * 1024`) — margem coerente com o que faz sentido para contratos; mensagem passa a ser "Arquivo excede 50 MB.".

### 3. `src/components/alugueis/RentalDocuments.tsx`
- Atualizar o texto de erro/hint se houver menção a 10 MB (atualmente não há texto fixo; nada a mudar além de garantir que a mensagem do hook seja exibida).

## Não muda
- Schema do banco, RLS, bucket e policies de Storage continuam iguais (o bucket já é privado com policies por usuário — o upload direto usa a mesma sessão autenticada, então RLS de Storage se aplica normalmente).
- UI/UX do painel de documentos permanece.
- Nenhum outro módulo é tocado.

## Observação técnica
Uploads diretos ao Supabase Storage sobem em `multipart/resumable`, sem passar pela server function nem pelo limite de payload do Worker. O teto prático fica ditado pelo bucket (padrão do projeto), muito acima dos 10 MB atuais.
