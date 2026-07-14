## Objetivo

Integrar o Google Sheets ao menu **Financeiro** para que administradores importem lançamentos a partir de uma planilha compartilhada da imobiliária, usando o conector oficial do Lovable (Google Sheets) — sem manipular tokens OAuth manualmente.

## Como a segurança funciona

- Conexão feita **uma única vez** por um admin do workspace via o conector `google_sheets` do Lovable (fluxo OAuth gerenciado; nada de client_id/secret no código).
- As credenciais ficam no gateway do Lovable; o app só recebe `LOVABLE_API_KEY` e `GOOGLE_SHEETS_API_KEY` como variáveis do servidor.
- Todas as chamadas à API do Google passam por **server functions** com `requireSupabaseAuth` + verificação `has_role('admin')`. Nenhum token vai ao navegador.
- UI e endpoints ficam ocultos para não-admin (guard existente `PermissionGuard` + checagem no servidor).

## Backend

### Migration nova
- Tabela `public.financeiro_sheet_config` (singleton por imobiliária): `id`, `spreadsheet_id`, `sheet_name`, `range`, `header_row`, `last_import_at`, `last_import_count`, `updated_by`, timestamps.
- GRANTs para `authenticated` e `service_role`; RLS: SELECT para qualquer autenticado (para saber se existe config), INSERT/UPDATE/DELETE somente `has_role(auth.uid(), 'admin')`.
- Trigger `touch_updated_at`.

### Server functions (`src/lib/financeiro/sheets.functions.ts`)
Todas com `requireSupabaseAuth` + checagem interna de role `admin`:
- `getSheetConfig()` — retorna config atual.
- `saveSheetConfig({ spreadsheetId, sheetName, range, headerRow })` — extrai o ID se o usuário colar a URL completa; valida via chamada de metadata ao gateway.
- `previewSheetRows({ limit })` — lê primeiras N linhas via gateway, retorna cabeçalho + amostra para conferência antes de importar.
- `importSheetRows()` — lê o range configurado, valida cada linha (Zod), transforma e insere em `financeiro_lancamentos` com `origem='google_sheets'` e `origem_id=<planilha>:<linha>` para idempotência (upsert por `origem_id`). Retorna `{ inserted, updated, skipped, errors[] }`.
- `disconnectSheet()` — apaga o registro de config (não desfaz a conexão OAuth do workspace).

Chamadas ao gateway:
```
GET https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}
GET https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}/values/{range}
```
Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_SHEETS_API_KEY}`. Erros do provedor propagados com status+body.

### Mapeamento de colunas (fixo, documentado na UI)
Ordem esperada na planilha (linha 1 = cabeçalho):

```text
data | descricao | categoria | tipo | valor | imobiliaria | status | corretor_email
```

- `data` em `YYYY-MM-DD` ou `DD/MM/YYYY`.
- `tipo` ∈ {entrada, saida}; `imobiliaria` ∈ {cordial, morar, ambas}; `status` ∈ {Pago, Pendente, Atrasado, Cancelado}.
- `corretor_email` opcional — resolvido para `corretor_id` via `profiles.email`.
- Linhas inválidas viram entradas em `errors[]` com `{ linha, motivo }` e não abortam o lote.

Idempotência: `origem_id = "<spreadsheetId>:<sheetName>!<linhaAbsoluta>"`; reimportações atualizam em vez de duplicar.

## Frontend

### Nova seção "Integrações" dentro do Financeiro
- Adiciona `integracoes` em `finance-sections.ts` e um item no side-nav do `FinancialDashboard`, visível apenas para admins.
- Novo componente `src/components/financeiro/GoogleSheetsIntegration.tsx`:
  - **Status da conexão**: badge "Conectado / Não conectado" baseado em `getSheetConfig` + probe silencioso ao metadata endpoint.
  - **Formulário** (admins): URL/ID da planilha, aba, range (ex.: `A2:H1000`), linha do cabeçalho.
  - **Botão "Prévia"** → mostra tabela com as 10 primeiras linhas e destaca colunas inválidas.
  - **Botão "Importar agora"** → confirma via `AlertDialog`, chama `importSheetRows`, exibe toast com `{inserted, updated, skipped}` e lista de erros por linha.
  - **Última importação**: data + contagem.
  - **Documentação inline** do formato esperado de colunas.
- Remove o card "Em breve: Conta Azul" apenas quando a nova seção estiver acessível (mantém para não-admin).

### Hooks
- `useSheetConfig` (query `["sheets","config"]`) e mutations `useSaveSheetConfig`, `usePreviewSheet`, `useImportSheet`. Invalidam `["financeiro","lancamentos"]` após import.

## Passos de ativação (uma vez, pelo admin)
1. Lovable chama `standard_connectors--connect` com `google_sheets` — admin escolhe/cria a conexão OAuth do workspace e autoriza.
2. Admin abre Financeiro → Integrações → Google Sheets, cola a URL da planilha, define aba e range, salva.
3. Compartilha a planilha com a conta Google usada na conexão (ou usa uma planilha já dessa conta).
4. Clica **Prévia** para conferir, depois **Importar agora**.

## Fora de escopo (para não expandir demais)
- Exportação, sincronização bidirecional e cron/agendamento automático. (Podem ser adicionados depois; a base já grava `last_import_at` e usa `origem_id` idempotente.)
- Múltiplas planilhas simultâneas. (Uma config por vez; trocar substitui.)

## Arquivos afetados
- **Migration nova**: `financeiro_sheet_config` (tabela + RLS + trigger).
- **Novos**: `src/lib/financeiro/sheets.functions.ts`, `src/hooks/useSheetsIntegration.ts`, `src/components/financeiro/GoogleSheetsIntegration.tsx`.
- **Editados**: `src/components/financeiro/finance-sections.ts` (nova seção), `src/components/financeiro/FinancialDashboard.tsx` (nav + render), `src/routes/_app.financeiro.tsx` (ajuste do footer/guard), `src/lib/financeiro/financeiro.functions.ts` (adicionar upsert por `origem_id`).
- **Conector**: acionar `standard_connectors--connect` para `google_sheets` no início da implementação (build mode).
