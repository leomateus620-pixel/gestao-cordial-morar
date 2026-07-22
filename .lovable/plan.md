## Objetivo

Manter o Supabase Storage como fonte primária dos anexos de Aluguéis e adicionar uma camada opcional de Google Drive: uma pasta dedicada por contrato, sincronização de arquivos (upload/renomear/substituir/apagar), gestão dos tokens OAuth por usuário admin, UI de status e retomada de falhas. Nenhum fluxo atual quebra; sem Drive conectado, tudo continua funcionando como hoje.

## Escopo (Aluguéis apenas)

Não altera Vendas, Agenda, Financeiro, Agenciamentos. Reaproveita o padrão OAuth já existente em `src/lib/google-calendar/google.server.ts` (mesmo `GOOGLE_OAUTH_CLIENT_ID/SECRET`, mesmo redirect pattern, mesmo `signState/verifyState`).

## Arquitetura

```text
UI Aluguéis ─► useRentalDocuments ─► server fns (rentals.functions.ts)
                                          │
                          ┌───────────────┼──────────────────────┐
                          ▼                                       ▼
                Supabase Storage                       drive.server.ts (OAuth + Drive v3)
                (rental-documents)                     - refresh token / retry / backoff
                          │                            - createFolder / uploadFile / rename
                          ▼                            - update / trash / list
              rental_contract_documents ◄────────────► rental_drive_folders
                    (+ colunas drive_*)                (metadados por contrato)
```

Regras:
- Storage é sempre a fonte primária. Drive é opcional e por-usuário.
- Falha de Drive nunca reverte upload no Storage: anexo fica `drive_sync_status='failed'` com retry manual.
- Idempotência: sempre pelo `drive_folder_id`/`drive_file_id` persistido, nunca por nome.

## Banco (uma migração)

1. `google_drive_connections` (nova, análoga a `google_calendar_connections`):
   - `user_id` (PK), `google_email`, `access_token`, `refresh_token`, `token_expires_at`, `scope`, `last_error`, timestamps.
   - RLS: `auth.uid() = user_id`. GRANTs autenticated/service_role.
2. `rental_drive_folders` (nova):
   - `contract_id` (FK unique → `rental_contracts.id`), `folder_id`, `folder_name`, `folder_url`, `owner_user_id`, `google_email`, `sync_enabled`, `last_synced_at`, `last_error`, `sync_status`, timestamps.
   - RLS: leitura pra qualquer usuário que já pode ler o contrato (via `rental_contracts` policy existente); escrita só admin/secretária.
3. `rental_contract_documents` (existente) — adicionar colunas:
   - `drive_file_id text`, `drive_web_view_url text`, `drive_mime_type text`, `drive_sync_status text default 'not_enabled'` (CHECK: not_enabled|pending|syncing|synced|failed|drive_only|cloud_only|deleted), `drive_last_synced_at timestamptz`, `drive_last_error text`, `content_hash text`, `updated_by uuid`.
   - Sem CHECK dependente de tempo; validação por trigger se necessário.
4. `rental_drive_audit_log` (nova): `id, contract_id, document_id nullable, user_id, action, result, error, destination, created_at`. Sem tokens.

Grants + RLS completos na mesma migration.

## Backend (novos módulos)

- `src/lib/google-drive/drive.server.ts` (server-only): scopes mínimos `openid email profile https://www.googleapis.com/auth/drive.file`. Funções: `buildAuthUrl`, `exchangeCode`, `refreshAccessToken`, `revokeToken`, `getUserInfo`, `ensureFolder`, `uploadFile` (multipart), `updateFileMetadata` (rename), `replaceFileContent`, `moveToTrash`, `getFile`. Backoff exponencial em 429/5xx, timeouts, erros estruturados. Nunca importado em código client-reachable no topo.
- `src/routes/api/public/google-drive.callback.ts`: rota pública para OAuth callback, mesma estrutura da do Calendar. Verifica state HMAC.
- `src/lib/google-drive/google-drive.functions.ts` (createServerFn, requireSupabaseAuth):
  - `startGoogleDriveOAuth`, `getMyDriveConnection`, `disconnectGoogleDrive`.
- Extensões em `src/lib/rentals/rentals.functions.ts`:
  - `enableRentalDriveSync(contractId)` — cria/vincula pasta (`Aluguel - <endereço> - <inquilino> - <shortId>`, sanitizado), grava `rental_drive_folders`, dispara backfill dos anexos existentes.
  - `disableRentalDriveSync(contractId, { keep|trash|detach })`.
  - `syncRentalDocument(documentId)` — upload/retry individual para Drive.
  - `syncRentalContractNow(contractId)` — bulk com batches de 3, retries, atualiza `sync_status`.
  - Alterar `registerRentalContractDocument`: se pasta habilitada, enfileira sync (chamada direta best-effort; falha marca `failed`).
  - Alterar `deleteRentalContractDocument`: parâmetro `scope: 'both'|'cloud'|'drive'`.
  - Novas: `renameRentalContractDocument(id, newName)`, `replaceRentalContractDocument(id, newFile)` (o upload novo no Storage vem do hook).
  - `handleRentalDeletion` hook adicional (não remove Drive por padrão; ação explícita).
- Autorização: toda função valida acesso ao contrato via RLS + verifica role (admin/secretaria para conectar Drive; broker do contrato pode ver/baixar).

## Frontend

- `src/hooks/useGoogleDriveConnection.ts` — status, connect, disconnect (paralelo ao Calendar hook).
- `src/hooks/useRentalDocuments.ts` — adiciona `renameFile`, `replaceFile`, `deleteFile({scope})`, `retrySync`, `syncAll`, expõe estado Drive por arquivo.
- `src/components/configuracoes/GoogleDriveCard.tsx` — em `_app.configuracoes.tsx` e/ou `_app.integracoes.tsx`. Conectar/desconectar, e-mail conectado, escopo, status, alerta de token expirado.
- `src/components/alugueis/RentalDocuments.tsx` — por arquivo: chip de destino (Cloud / Drive / Ambos / Pendente / Falhou), ações (Renomear, Substituir, Abrir no Drive, Copiar link, Excluir com modal de escopo), botão retry por linha.
- No cabeçalho do bloco de documentos: badge de status da pasta, ação "Abrir pasta no Drive", "Sincronizar agora", "Habilitar sincronização com Drive" (quando não habilitado). Estados: desconectado, sem permissão, token expirado, erro de rate limit.
- `RentalFormModal.tsx` — sem mudança estrutural; se o contrato tem Drive habilitado e criação nova, uploads pendentes são sincronizados após save (best-effort, aviso em toast se falhar).
- Icone Google Drive em `src/assets/` (SVG oficial).

## Segurança e permissões

- Tokens só no backend, criptografados em repouso via Supabase (colunas texto; nunca logados).
- Escopos mínimos: `drive.file` (só arquivos criados/abertos pelo app).
- Frontend não vê refresh_token/access_token/client_secret.
- Permissões UI espelham RLS: admin/secretaria conectam e gerem pasta; corretor do contrato faz upload/download/sync retry; só admin/secretaria excluem no Drive.
- Auditoria em `rental_drive_audit_log` para todas as ações relevantes.

## Config / Secrets

Reusar `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` já presentes. Nenhum secret novo necessário (o redirect é derivado do `origin`). Documentar: adicionar `https://<host>/api/public/google-drive/callback` como Authorized Redirect URI no Google Cloud Console e habilitar Drive API no projeto.

## Testes e validação

- Fluxo OAuth completo (connect/refresh/revoke).
- Criação idempotente de pasta.
- Upload novo → Storage + Drive; falha Drive → status `failed` + retry ok.
- Rename/Replace/Delete em cada escopo.
- Backfill de contrato antigo (bulk, batches, sem duplicar).
- Isolamento: broker de outro contrato não acessa.
- Rate limit 429 simulado.
- Layout mobile e desktop no `RentalDocuments` e `GoogleDriveCard`.

## Fora de escopo

- Preview embutido de Google Docs, movimentação entre contratos, compartilhamento externo, Shared Drives, sync bidirecional (Drive → app).
