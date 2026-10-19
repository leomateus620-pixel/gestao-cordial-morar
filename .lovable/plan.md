# Incidente 19/10 — tela branca após login e banco sobrecarregado

## Verificado antes do plano
- Nenhuma migração adiciona `'conflict'` ao tipo de status de publicação (só existe como chave JSON em 0002). O código de conflito terminal grava um valor que o banco não aceita: defeito confirmado.
- A área logada (`src/routes/_app.tsx`) não tem `errorComponent`; só as rotas do site público têm. O erro de raiz em `__root.tsx` está em inglês.
- `property_image_recovery_candidates` está em `supabase/migrations/20260923032000_*` e é chamada por `src/lib/imoveis/image-pipeline.server.ts`.
- A origem exata do erro que derruba a tela (sessão, perfil, papéis ou loader) **não está confirmada**: é o passo 1.1.

## Ordem de execução
1. Código da tela (sem banco) — vai primeiro, protege os usuários mesmo com o banco lento.
2. Migração 0029 pequena: enum `conflict` (apenas ADD VALUE, sozinha, porque não pode ser usada na mesma transação).
3. Migração 0030: função de limpeza em lotes + índice parcial + reescrita leve da função de recuperação.
4. Agendamentos: `cron.alter_job` (sem recriar) e novo job de limpeza a cada 10 min.
5. Testes, typecheck, build, publicação (autorizada pelo Leonardo).

## 1) Fim da tela branca
1.1 Reproduzir com Playwright bloqueando `/rest/v1/*` com 503 PGRST002 e anotar qual chamada lança o erro sem tratamento (provavelmente perfil/papéis em `src/lib/auth-mock.ts`/store, ou `AppShell`).
1.2 Novo `src/lib/net/retry-read.ts`: `retryRead(fn)` com 3 tentativas (0,5 s / 1,5 s / 3 s) só para erros transitórios (PGRST002, 503, 504, timeout, `fetch failed`, `Failed to fetch`). Escritas nunca passam por ele.
1.3 Usar em: sessão/perfil/papéis/imobiliárias; checagem de cliente duplicado do Novo atendimento (`src/components/sheets/novo-atendimento.tsx` e a função usada) — se falhar, segue com aviso “Não foi possível conferir duplicidade agora; o sistema confere ao salvar”.
1.4 `src/components/shared/SystemUnavailable.tsx`: “Sistema temporariamente indisponível. Tentando reconectar…”, botão “Tentar de novo” (invalida rota + reset), nova tentativa automática a cada 15 s.
1.5 `errorComponent` em `_app.tsx` usando esse componente; erro de raiz e 404 de `__root.tsx` traduzidos; `defaultErrorComponent` no `router.tsx`. Falha de perfil/papéis não derruba mais o shell: mostra o aviso dentro da casca.
1.6 `src/lib/net/notify.ts`: toasts com `id` fixo por tipo de erro (deduplicação) e tradução de mensagens técnicas para português.

## 2) Status “Conflito de código”
- 0029: `ALTER TYPE public.property_publication_status ADD VALUE IF NOT EXISTS 'conflict';`
- Rótulo “Conflito de código” nos mapas de status, filtros e contadores (busca por `property_publication_status`/mapas de rótulo em `src/components/imoveis/*`, `src/lib/imoveis/*`, `src/lib/imobibrasil/*`).
- Conferir em código e nas funções de fila/recuperação que `conflict` fica fora de qualquer reenfileiramento (lista explícita de status elegíveis); ajustar só onde usar “diferente de X”.

## 3) Limpeza do histórico de execuções
- `public.cron_history_prune(p_batch int default 5000)` SECURITY DEFINER, `search_path` fixo, `statement_timeout` local de 5 s: apaga até 5.000 linhas com `end_time < now() - 3 dias` escolhidas pelo `runid` (chave primária, ordem crescente). REVOKE de PUBLIC/anon/authenticated.
- Job `cron-history-prune` a cada 10 min (`*/10`), ~720 mil linhas/dia de capacidade, suficiente para drenar o acumulado em ~1 dia sem picos. Nada apagado dentro da migração.

## 4) Agendamentos escalonados (alter_job)
| Job | Hoje | Novo | Motivo |
|---|---|---|---|
| property-sync-worker | 1 min | 1 min (seg. 0) | não pausar sync Imobi; publicação também chama o worker na hora |
| property-media-worker | 1 min | `1-59/2` | fotos já são disparadas ao publicar |
| property-image-worker | 1 min | `*/3` | processamento de fundo |
| property-drive-worker | 1 min | `2-59/5` | pastas não são urgentes |
| property-import-worker | 1 min | `*/3` deslocado | importação é iniciada pelo usuário |
| push-outbox-retry | 1 min | `*/2` | só reenvio; envio inicial é imediato |
| agenda-reminders-dispatch | 1 min | `*/2` | lembrete atrasa no máx. 2 min |
| google-calendar-sync-drain | 1 min | `*/5` | sincronização de fundo |
| public-site-media-derivatives | 1 min | `*/5` | derivados também são gerados sob demanda |
| nfse-pdf-retry | — | sem mudança | fora do escopo |
- Onde houver tabela de fila simples, o comando do job passa a ser `SELECT net.http_post(...) WHERE EXISTS (pendente)` mantendo `internal_worker_headers()`; aplicado só após ler o comando atual de cada job.
- Resultado esperado: de ~9 disparos/minuto para ~3,5.

## 5) Recuperação de fotos
- Ler o plano de execução atual (EXPLAIN simples, sem ANALYZE pesado) e criar o índice parcial correspondente ao filtro (ex.: `property_images(property_id, updated_at) WHERE status em estados recuperáveis`), `CREATE INDEX IF NOT EXISTS` — tabela pequena o bastante para não usar CONCURRENTLY; se for grande, cria-se fora da migração em horário calmo.
- Reescrita mínima com `CREATE OR REPLACE` mesma assinatura e mesmo resultado; job `property-image-retry` para `*/10`.

## Testes
- `retry-read`: repete 3x em PGRST002/503/504/timeout, não repete em 400/401/23505, nunca usado em escrita.
- `SystemUnavailable`/mapa de mensagens: erro transitório vira texto em português, nada em inglês.
- Status: `conflict` presente no tipo, com rótulo, e fora da lista de reenfileiramento.
- `cron_history_prune` em banco isolado: apaga só > 3 dias e no máximo o lote.
- `bun run test`, `bun run test:site`, typecheck, build; reprodução Playwright com 503 forçado mostrando o aviso em vez da tela branca.

## Riscos
- Se o disco estiver cheio/lento, migrações podem expirar: cada uma é pequena e repetível (`IF NOT EXISTS`). Aumentar disco/instância do Lovable Cloud continua sendo a solução real da lentidão; o código só reduz a carga.
- `ADD VALUE` não pode ser revertido; é inofensivo.
- Intervalos maiores atrasam alguns minutos fotos, Drive, agenda Google e lembretes.
- Limpeza gradual: o espaço só volta ao disco depois de VACUUM automático; não forçar VACUUM FULL.

## Fora do escopo
Dados, NFS-e, regras de endereço, códigos 1406/3405/1385, ordem/envio de fotos, pausar sync Imobi.
