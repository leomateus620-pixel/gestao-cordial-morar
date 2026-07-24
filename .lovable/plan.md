## Objetivo

Migrar todos os registros existentes em `public.clients` para o CRM unificado (`public.attendances`), preservando propriedade por usuário e categorizando cada um na etapa correta do funil.

## Situação atual (verificada)

- 12 clientes cadastrados em `clients`. Apenas 3 já possuem `attendance` vinculado; 9 estão órfãos do CRM.
- `assigned_broker_id` mistura IDs reais (UUIDs de Felipe, Pablo, Bruna, Geandre) com strings mock antigas: `"ricardo"`, `"bianca"`, `"a_definir"`.
- `attendances.cliente_id` já existe e `pipeline_stage` está ativo — a migração unificada mais recente já preparou o schema.
- `handle_new_user` / triggers de histórico continuam válidos: cada INSERT dispara `attendances_log_history` e cria evento `criacao` automaticamente.

## Regras de mapeamento

**Broker (`corretor_id` / `corretor_nome`)**
- UUID válido em `assigned_broker_id` → mantém como texto (formato atual da coluna).
- `"ricardo"` → `87e85211-12a8-4f1a-bce2-73eddd1cedad` (Ricardo Caetano).
- `"bianca"` → `b06a522f-65b4-4e2a-8bb4-e9e1f0675b75` (Bianca Regina).
- `"a_definir"` → `NULL` (sem corretor atribuído; aparece na fila para a secretaria distribuir).

**Status → pipeline_stage** (via `statusToPipelineStage` já existente)
- `novo`, `aguardando_retorno`, `sem_retorno` → `primeiro_contato`
- `em_atendimento` → `apresentando_solucao`
- `visita_agendada` → `visita`
- `proposta_enviada`, `negociacao` → `proposta`
- `fechado` → `fechamento`
- `perdido` → `perdido`; `arquivado` → `arquivado`

**Campos copiados 1:1**: `full_name→cliente_nome`, `phone→telefone`, `email`, `contact_preference→contato_preferencial`, `lead_origin→origem`, `brand→imobiliaria`, `purpose→finalidade` (com `locacao→aluguel`, `venda→compra`), `property_type→tipo_imovel`, `bedrooms→dormitorios`, `neighborhood→bairro_interesse`, `min_budget`, `max_budget`, `notes→observacoes`, `next_step→proximo_passo` (quando bate com enum, senão vira observação), `next_follow_up_at→proximo_retorno`, `created_by`, `created_at`.

**Ownership**: `created_by` = `clients.created_by` (mantém dono original — a maioria foi criada pela Bianca, e as políticas RLS já dão acesso a criador, corretor atribuído, admin e secretaria).

## Passos

1. **Migração idempotente** (`supabase/migrations/<timestamp>_backfill_atendimentos_from_clients.sql`):
   - `INSERT INTO public.attendances (...) SELECT ... FROM public.clients c WHERE NOT EXISTS (SELECT 1 FROM public.attendances a WHERE a.cliente_id = c.id)`.
   - Aplica todas as regras de mapeamento acima em CTEs (broker resolver, finalidade, prioridade default `media`, contato default `whatsapp`).
   - Deixa `pipeline_stage` explícito no INSERT (para que o trigger de histórico registre o valor correto de entrada).
   - Aditiva e re-executável (o `NOT EXISTS` garante idempotência).

2. **Validação pós-migração** (executada como parte do plano de verificação, não como código):
   - `SELECT count(*) FROM clients` = `SELECT count(DISTINCT cliente_id) FROM attendances WHERE cliente_id IS NOT NULL`.
   - Amostragem por corretor: cada broker real vê seus atendimentos migrados; itens `a_definir` aparecem sem corretor.
   - Distribuição por `pipeline_stage` coerente com o `status` de origem.
   - Timeline (`attendance_history`) contém o evento `criacao` para cada linha nova (gerado automaticamente pelo trigger).

## Fora de escopo

- Não altera schema, RLS, triggers, nem o módulo Clientes (já redirecionado para `/atendimentos`).
- Não mexe em atendimentos existentes — só cria os que faltam.
- Não cria "properties" canônicas; `imovel_codigo`/`imovel_descricao` permanecem como snapshot textual.

## Detalhes técnicos

- Migração roda via `supabase--migration` (schema/DML estrutural de backfill único).
- Enum de finalidade: `clients.purpose` armazena `compra`/`venda`/`locacao`/`aluguel` — normalizado no CTE para o domínio de `attendances.finalidade` (`compra`|`aluguel`|`ambos`).
- `proximo_passo` só é preenchido se `next_step` corresponder a um valor do enum de próximo passo; caso contrário concatena ao `observacoes` para não perder informação.
