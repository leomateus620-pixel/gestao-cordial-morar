# Documentos internos

Transformar o menu "Documentos" (hoje alimentado por dados fictícios) em **Documentos internos**: um repositório real da imobiliária, com upload, download seguro, renomeação e exclusão — usando a mesma infraestrutura de anexos já usada em Aluguéis e Vendas.

## Regras definidas

- Acesso: **somente admin**. Corretores e secretária não veem o menu nem os arquivos.
- Categoria única: **Geral** (arquitetura preparada para novas categorias no futuro).
- Armazenamento apenas na nuvem interna (sem espelho no Google Drive).

## O que o usuário vai ver

Menu "Documentos internos" (Gestão e crescimento):

- Cartões de resumo: total de arquivos, espaço usado, último envio.
- Área de envio grande com **arrastar e soltar** ou clique, aceitando PDF, imagens, Word, Excel e texto (até 50 MB por arquivo), com envio de vários arquivos de uma vez e barra de progresso.
- Busca por nome e ordenação (mais recentes / nome / tamanho).
- Lista de arquivos com ícone por tipo, nome, tamanho, quem enviou e quando; ações: **Abrir/Baixar**, **Renomear**, **Excluir** (com confirmação).
- Campo opcional de descrição por arquivo, editável depois.
- Estados vazios, de carregamento e de erro claros, no mesmo estilo visual do restante do sistema.

## Detalhes técnicos

1. **Banco**: nova tabela `public.internal_documents` (`title`, `description`, `category` default `geral`, `file_path`, `file_name`, `mime_type`, `size_bytes`, `uploaded_by`, timestamps + trigger `touch_updated_at`). GRANTs para `authenticated` e `service_role`, RLS habilitada e políticas de SELECT/INSERT/UPDATE/DELETE restritas a `public.has_role(auth.uid(), 'admin')`.
2. **Storage**: bucket privado `internal-documents` criado pela ferramenta de storage; políticas em `storage.objects` liberando o bucket apenas para admins.
3. **Server functions** em `src/lib/documentos/documentos.functions.ts` com `requireSupabaseAuth` + checagem de admin: `listInternalDocuments`, `registerInternalDocument`, `updateInternalDocument`, `deleteInternalDocument` (remove do storage e da tabela) e `getInternalDocumentUrl` (URL assinada de 1h), seguindo o padrão de `rentals.functions.ts`/`sales.functions.ts`.
4. **Hook** `src/hooks/useInternalDocuments.ts` no padrão de `useRentalDocuments.ts`: upload direto ao Storage pelo cliente + registro na tabela, com rollback do arquivo em caso de falha, e invalidação de cache.
5. **UI**: `src/routes/_app.documentos.tsx` reescrito consumindo o hook, com novos componentes em `src/components/documentos/` (`DocumentUploadZone`, `DocumentList`, `DocumentRow`, `DocumentSummaryCards`, `RenameDocumentDialog`). Remoção da dependência de `documentos` do mock store nessa rota.
6. **Permissões**: rótulo do menu alterado para "Documentos internos" em `module-menu.ts`; módulo `documentos` mantido apenas em `admin_owner` (já é o caso em `permissions.ts`), com `RequireModuleAccess` na rota.
7. **Testes**: teste unitário para o helper de formatação/validação de upload (tipo e tamanho) e verificação manual do fluxo upload → download → renomear → excluir.
