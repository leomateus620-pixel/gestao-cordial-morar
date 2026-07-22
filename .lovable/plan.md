
## Objetivo

Trocar o fluxo atual de OAuth próprio do Google Drive (por-usuário) pela conexão **ricardodrive** (App connector `google_drive`, credencial única do workspace) que você acabou de adicionar, e restringir toda a operação a **uma única pasta raiz** com subpastas por contrato de aluguel.

## Como o acesso fica limitado

O App connector do Google Drive usa uma única conta compartilhada (Leonardo/ricardodrive). Todos os anexos de aluguéis do sistema serão gravados nessa conta. Para "limitar somente à pasta principal e subpastas dos anexos do menu Aluguéis":

- Criar/reutilizar uma **pasta raiz fixa** no Drive dessa conta: `Gestão Cordial — Aluguéis` (ID salvo em `app_settings`).
- Toda pasta de contrato vira **subpasta** dessa raiz (`Aluguel - <endereço> - <locatário> - <id-curto>`).
- Todo upload, rename, replace, trash é feito **exclusivamente** com `parents=[root|contractFolder]` e via `fileId` já registrado em `rental_contract_documents.drive_file_id` / `rental_drive_folders.drive_folder_id`. O código nunca lista/consulta arquivos fora dessa árvore.
- Toda chamada passa por um helper único `driveFetch()` que valida que o `fileId`/`folderId` alvo pertence à árvore (via `parents` ou lookup na tabela) antes de executar. Isso confina a operação mesmo com o escopo amplo do connector.

## Mudanças de código

### Backend — `src/lib/google-drive/drive.server.ts`
- Remover OAuth próprio (`GOOGLE_AUTH_URL`, `exchangeCode`, `refreshAccessToken`, `revokeToken`, `getUserinfo`, `signState/verifyState`, `getRedirectUri`, `buildAuthUrl`, `getConnectionForUser`, `getValidAccessToken`, `withAccessToken`, `markConnError`).
- Substituir `driveFetch` para chamar via **connector gateway**:
  - Base: `https://connector-gateway.lovable.dev/google_drive/drive/v3`
  - Upload base: `https://connector-gateway.lovable.dev/google_drive/upload/drive/v3`
  - Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_DRIVE_API_KEY}`
- Adicionar `getRootFolderId()`:
  - Lê `app_settings.google_drive_root_folder_id`.
  - Se ausente, cria pasta `Gestão Cordial — Aluguéis` (mimeType folder, sem `parents`) e persiste o id.
- Reescrever `ensureFolder(folderName)` para criar a subpasta **sempre com `parents=[rootFolderId]`** e buscar apenas dentro da raiz (`'<rootId>' in parents`).
- Manter `uploadFile`, `renameFile`, `replaceFileContent`, `moveToTrash`, `logAudit`, `buildFolderName`, `sanitizeSegment`.
- Adicionar guard `assertInsideRentalTree(fileId)` usado antes de rename/replace/trash (checa `parents` do arquivo contra `rootId` ou pastas de contrato conhecidas).

### Backend — `src/lib/google-drive/google-drive.functions.ts`
- Remover `startGoogleDriveOAuth`, `disconnectGoogleDrive`, `getMyDriveConnection`.
- Substituir por:
  - `getDriveConnectionStatus()` → verifica presença das env vars do connector + faz um `about.get` leve para confirmar acesso; retorna `{ connected, rootFolderId, rootFolderUrl, lastError }`.
  - `ensureRentalDriveFolder(contractId)`, `syncRentalDocumentToDrive(documentId)`, `syncAllContractDocuments(contractId)`, `removeDocumentFromDrive(documentId)` — mantidos, agora sem `userId` como chave (uma única conta), ainda gravando em `rental_drive_folders` / `rental_contract_documents` como hoje.
- Restringir chamada a admin/secretaria (as ações operam sobre a conta compartilhada).

### Rota OAuth
- Deletar `src/routes/api/public/google-drive.callback.ts` (não é mais necessário).

### Frontend — `src/components/configuracoes/GoogleDriveCard.tsx`
- Remover fluxo de conectar/desconectar/reconectar por usuário.
- Passar a exibir status da conexão do workspace: "Conectado como conta compartilhada do workspace (ricardodrive) — pasta raiz: **Gestão Cordial — Aluguéis**" + link para a pasta no Drive + botão "Testar conexão".
- Mensagem clara: todos os anexos de Aluguéis são espelhados nessa conta única, dentro da pasta raiz.

### Frontend — `src/components/alugueis/RentalDocuments.tsx`
- Sem mudança funcional, apenas ajustar copy quando `connection.connected === false` (pedir para admin conectar o connector no workspace).

### Banco de dados (migração)
- Nova tabela `app_settings (key text primary key, value jsonb, updated_at)` (se ainda não existir) com GRANT e RLS restrita ao service_role — usada só pelo servidor para guardar `google_drive_root_folder_id`.
- **Drop** de `public.google_drive_connections` (não é mais usada). Manter `rental_drive_folders`, `rental_contract_documents.drive_*` e `rental_drive_audit_log`.

### Env vars
- Passam a ser usadas automaticamente após `standard_connectors--connect` da `ricardodrive`: `LOVABLE_API_KEY`, `GOOGLE_DRIVE_API_KEY`. Nada precisa ser adicionado manualmente.

## Passo a passo de execução

1. Vincular a conexão `ricardodrive` ao projeto (`standard_connectors--connect` com `connector_id: google_drive`).
2. Migração SQL: criar `app_settings`, dropar `google_drive_connections`.
3. Reescrever `drive.server.ts` para gateway + root folder guard.
4. Reescrever `google-drive.functions.ts` para o novo modelo compartilhado.
5. Deletar rota `api/public/google-drive.callback.ts`.
6. Reescrever `GoogleDriveCard.tsx`.
7. Verificar `rentals.functions.ts` (o auto-sync em `registerRentalContractDocument` continua igual — só troca a implementação por baixo).
8. Testar: criar contrato de teste, subir anexo, confirmar pasta raiz + subpasta + arquivo no Drive do ricardodrive; renomear e remover; validar `rental_drive_audit_log`.

## Ponto a confirmar

Este connector é **App connector** (uma única conta Google compartilhada — a `ricardodrive` da sua conta). Isso significa que **todos os anexos de aluguéis de todos os usuários** serão armazenados nessa conta única, dentro da pasta raiz. Está de acordo com o que você quer? Se preferir que cada corretor use o próprio Drive, precisamos do **App User connector** de Google Drive (fluxo diferente), não do App connector — me avise antes de eu executar.
