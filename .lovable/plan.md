## Objetivo

Tornar a integração da planilha do Google → menu Financeiro **automática, contínua e segura**, sem depender do botão "Importar agora". Quando você preencher/alterar qualquer lançamento na planilha (Jan26…Dez26), os dados aparecem no Financeiro sozinhos, com cálculos corretos e RLS preservada.

## Como vai funcionar

```text
Planilha Google (mensal: Jan26…Dez26)
        │  (leitura via connector já conectado)
        ▼
Job automático (pg_cron a cada 5 min)
        │  chama endpoint público seguro
        ▼
/api/public/hooks/financeiro-sheets-sync   ← valida segredo + roda import
        │  usa mesma lógica de sheets.functions.ts
        ▼
Tabela financeiro_lancamentos (upsert por origem_id estável)
        │  Realtime ligado
        ▼
Menu Financeiro atualiza sozinho (sem recarregar / sem clicar)
```

## Passos

1. **Endpoint de sync automático** — `src/routes/api/public/hooks/financeiro-sheets-sync.ts`:
   - Valida header `x-cron-secret` (segredo novo `FINANCEIRO_SYNC_SECRET`) — sem segredo válido = 401.
   - Lê **todas** as configs em `financeiro_sheet_config` e, para cada uma, reexecuta a lógica de leitura + parse já existente em `sheets.functions.ts` (todos os meses do ano — Jan…Dez).
   - Faz **upsert** em `financeiro_lancamentos` usando `origem_id` (UUID estável a partir de `planilha+aba+linha`), de modo que edições na planilha **atualizam** o lançamento existente e novas linhas são inseridas — sem duplicar.
   - Detecta linhas removidas da planilha e marca como excluídas (soft-delete via `deleted_at` — coluna nova) para não poluir os totais.
   - Loga cada execução em `financeiro_sync_log` (nova tabela: `ran_at`, `inserted`, `updated`, `deleted`, `errors_json`).

2. **Refatoração mínima de `sheets.functions.ts`**:
   - Extrair a lógica de leitura/parse para um helper reutilizável chamado tanto pelo `importSheetRows` (manual) quanto pelo endpoint de cron.
   - Manter parse atual (`1-jul.`, `dd/mm/aaaa`, serial etc.).

3. **Migração de banco** (uma migration única):
   - Nova tabela `financeiro_sync_log` (id, ran_at, inserted, updated, deleted, errors jsonb, config_id) com RLS: SELECT só para admin, INSERT só service_role. GRANTs conforme padrão.
   - Adicionar coluna `deleted_at timestamptz` em `financeiro_lancamentos` e ajustar policies/queries existentes para filtrar `deleted_at IS NULL`.
   - Adicionar `ALTER PUBLICATION supabase_realtime ADD TABLE public.financeiro_lancamentos` para o dashboard receber updates em tempo real.
   - Índice único parcial em `(origem, origem_id) WHERE origem = 'google_sheets'` para garantir upsert.

4. **Agendamento (pg_cron)** — via `supabase--insert`:
   - Job `financeiro-sheets-autosync` executando **a cada 5 minutos**, chamando o endpoint público com o header `x-cron-secret`.
   - URL estável: `https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/financeiro-sheets-sync`.

5. **UI reativa (sem botão obrigatório)**:
   - No `FinanceDashboard`, assinar Realtime de `financeiro_lancamentos` e invalidar queries do TanStack Query quando chegar evento — os cards, gráficos e listas se atualizam sozinhos.
   - Em `GoogleSheetsIntegration.tsx`: manter o botão "Importar agora" apenas como **forçar sync** opcional; mostrar badge "Sincronização automática ativa • última: HH:MM" lendo `financeiro_sync_log`.

6. **Segurança (RLS + segredo)**:
   - Segredo `FINANCEIRO_SYNC_SECRET` criado via ferramenta de secrets — só o cron conhece.
   - Endpoint público valida o segredo antes de qualquer leitura/escrita.
   - Escritas usam `supabaseAdmin` **apenas** dentro do handler, após validar o segredo (padrão do template).
   - `financeiro_lancamentos` mantém RLS existente; leitura no app continua pelo usuário autenticado.
   - `financeiro_sync_log` só é lido por admins.

## Detalhes técnicos

- **Upsert idempotente**: `origem_id` já é UUID estável (`hash(spreadsheetId::aba::linha)`), então mover uma linha de posição na planilha cria um novo `origem_id` — combinamos upsert por `origem_id` **e** soft-delete de `origem_ids` que sumiram desde a última sync daquele mês (comparando conjunto atual vs conjunto anterior por aba).
- **Frequência**: 5 min é o intervalo padrão; posso ajustar para 1 min ou 15 min depois se quiser.
- **Custos/limite Google**: batchGet cobre todas as abas em 1 request por sync, bem abaixo de qualquer quota.
- **Sem edge functions**: tudo em TanStack server routes conforme padrão do projeto.
- **Nenhuma alteração** em business logic do Financeiro fora do que os lançamentos alimentam — cálculos, KPIs, gráficos continuam iguais, só passam a receber dados atualizados automaticamente.

## Fora do escopo (posso fazer depois se quiser)

- Webhook do Google Apps Script para sync <5s (requer configurar script na planilha).
- Reconciliação retroativa por período customizado.
- Painel de histórico visual de syncs além do badge.