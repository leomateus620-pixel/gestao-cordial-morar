
# Revisão técnica — CRM Atendimentos (branch `codex/atendimentos-crm-production`)

## 1. Estado real encontrado (evidências)

**Migrations aplicadas** (últimas no remoto, `20260724180506` é a mais recente aplicada). A migration `20260724233000_atendimentos_integridade_contextual.sql` **ainda NÃO foi aplicada**: as colunas `imovel_ref`, `interesse_descricao`, `imovel_endereco`, `imovel_bairro`, `imovel_cidade`, `imovel_tipo`, `imovel_valor` não existem em `public.attendances`. A função `attendances_log_history` no remoto ainda é a versão antiga (um evento por campo, com `event_type` tipado — `stage_change`, `status_change`, `broker_change`, etc.).

**Triggers atuais em `attendances`**: `trg_attendances_history_ins`, `trg_attendances_history_upd`, `trg_notify_atendimento_corretor`, `attendances_touch_updated_at`. Sem duplicação.

**Dados reais** (19 linhas):
- `imovel_id` (uuid) preenchido em **0/19**. Nunca foi usado — o catálogo de imóveis no app usa IDs locais tipo `im1`, incompatíveis com `uuid`.
- `imovel_descricao` preenchido em **12/19** — mistura de texto livre ("Cliente quer visitar…") e referências reais ("Interesse no cód 806", "Interesse no Residencial Cambará").
- `imovel_codigo` preenchido em **9/19** com valores como `"Cód 1258"`, `"Cód 2940 e 3109"`, `"Cod 1259"` — **códigos reais de imóveis** já digitados manualmente.

**Fonte canônica de imóveis**: **não existe** tabela `public.imoveis` / `properties`. Só `rental_properties` (aluguéis). O catálogo de imóveis para venda vive hoje em mocks/serviços front-end.

**Dependências do front no `event_type` estruturado**:
- `src/lib/attendances/attendances.functions.ts:309` filtra `event_type='stage_change'` para reconstruir a transição atual do funil.
- `src/components/atendimentos/AtendimentoDetailDrawer.tsx:857-860` mapeia `stage_change`, `status_change`, `broker_change` para rótulos na timeline.

## 2. Problemas identificados na migration recente

1. **Backfill destrutivo**. `UPDATE … SET imovel_descricao=NULL, imovel_codigo=NULL WHERE imovel_id IS NULL` afeta **19/19 linhas** e **apaga códigos reais** ("Cód 1258", "Cód 2940 e 3109") que hoje são a única referência ao imóvel. Também move texto de descrição sem separar código de observação. Não é idempotente auditável (nenhum log).
2. **Quebra o histórico estruturado**. A nova função grava tudo como `event_type='attendance_update'` (um único tipo consolidado), enquanto o app filtra por `stage_change` para descobrir a etapa atual e renderiza rótulos por tipo. Aplicar como está silenciosamente esvazia badges e a lógica de "última transição".
3. **`imovel_ref TEXT` sem contrato**. Adiciona coluna nova sem plano de escrita: o front nunca grava nela, e nada migra `imovel_codigo` existente para `imovel_ref`. Fica órfã.
4. **Sem GRANT/policy revisitados** para as novas colunas (herdam da tabela — OK), mas a policy `Attendance staff can view assignment profiles` para `profiles` amplia leitura globalmente para todo `authenticated`; considerar restringir a linhas com role admin/secretaria/corretor.
5. **Sem consulta de diagnóstico** antes do UPDATE — o requisito do usuário exige diagnóstico antes de mover.

## 3. Plano de correção (aditivo, idempotente, sem editar migration já revisada)

Como a migration `20260724233000` **ainda não foi aplicada**, o correto é **editá-la in-place** (nunca aplicada = não é histórico) para removê-la do risco. Regra do prompt "não editar migration aplicada" não se aplica aqui — confirmado por consulta.

### 3.1 Reescrever a migration `20260724233000`

- **Manter**: colunas snapshot novas (`imovel_endereco`, `imovel_bairro`, `imovel_cidade`, `imovel_tipo`, `imovel_valor`, `interesse_descricao`) — são aditivas e úteis.
- **Trocar `imovel_ref TEXT` por reuso de `imovel_codigo`** como referência textual canônica enquanto não há tabela `imoveis`. Documentar em comentário SQL: quando existir catálogo, migrar `imovel_codigo` → FK.
- **Remover o UPDATE destrutivo**. Substituir por:
  - `interesse_descricao := imovel_descricao` apenas quando `imovel_codigo IS NULL AND imovel_id IS NULL` (linhas comprovadamente sem referência).
  - **NÃO** anular `imovel_descricao` nem `imovel_codigo`. `imovel_descricao` passa a ser tratado como snapshot textual do imóvel; `interesse_descricao` como observação livre.
  - Registrar contagem afetada via `RAISE NOTICE`.
- **Reescrever a função `attendances_log_history` preservando `event_type` estruturado**: manter os tipos `stage_change`, `status_change`, `broker_change`, `client_link`, `property_link`, `next_return`, `next_action` (como já existe no remoto). Adicionar novos tipos apenas para o que faltava: `contact_change`, `preferences_change`. Cada evento continua sendo uma linha, com `previous_value`/`new_value` e `metadata.changed_fields`. Isso mantém compat com `attendances.functions.ts` e o Drawer.
- **Guardar contra "ruído"**: ignorar mudanças que só afetam `updated_at`, `opened_at`, `opened_by` (já ignorados hoje porque não estão listados — verificar).
- **Policy de profiles**: restringir a `has_role(id,'admin') OR has_role(id,'secretaria') OR has_role(id,'corretor')` para não expor perfis fora do time comercial.

### 3.2 Frontend

- `attendance-field-mapping.ts` / `AtendimentoFormModal`: gravar `imovel_codigo` quando o usuário digita "Cód 1258" (parser leve: trim, normalizar). Manter `imovel_descricao` como snapshot do título, `interesse_descricao` como observação.
- `AtendimentoDetailDrawer`: exibir `imovel_codigo` como badge principal + `interesse_descricao` separado de `imovel_descricao`.
- Não adicionar consumo de `imovel_ref` (removido do schema).

### 3.3 Rotas / redirects

- `src/routes/_app.clientes.$clienteId.tsx`: preservar o id como `clienteId` explícito no destino em vez de descartar:
  ```ts
  throw redirect({ to: "/atendimentos", search: { clienteId: params.clienteId } })
  ```
- `_app.atendimentos.tsx` `validateSearch`: aceitar `clienteId?: string` além de `id?: string`. Ao entrar com `clienteId`, filtrar a lista/kanban por esse cliente e destacar o card correspondente.
- `_app.clientes.tsx`: mantém redirect para `/atendimentos` sem parâmetros.
- `routeTree.gen.ts`: não tocar (gerado).

### 3.4 Validações e higiene

- WhatsApp: `wa.me` só quando `normalizePhoneToE164()` retornar válido; caso contrário, botão desabilitado com tooltip "telefone inválido". Aplicar em Card e Drawer.
- Concorrência de transição de etapa: em `transitionStage`, adicionar `.eq("pipeline_stage", expectedPrevious)` (compare-and-set); em conflito, invalidar queries e mostrar toast "etapa mudou em outra sessão".
- Botões de ação do drawer com `disabled` durante mutation (evita double-submit).

## 4. Validação obrigatória

- Diagnóstico SQL (executar antes de aplicar migration): contagem de linhas `WHERE imovel_id IS NULL AND imovel_codigo IS NOT NULL` (não devem perder código); linhas `WHERE imovel_id IS NULL AND imovel_codigo IS NULL AND imovel_descricao IS NOT NULL` (candidatas ao backfill).
- Após aplicar: `SELECT count(*) FROM attendance_history WHERE event_type='stage_change'` continua > 0 (compat mantida).
- `tsgo` + `bunx vitest run` em `src/lib/attendances/**`.
- Teste manual: criar atendimento → mudar etapa (1 evento `stage_change`), trocar corretor (1 evento `broker_change`), editar telefone (1 evento `contact_change` novo). Timeline deve renderizar 3 linhas distintas.
- Deep links: `/atendimentos`, `/atendimentos?id=<uuid>`, `/atendimentos?clienteId=<uuid>`, `/clientes` (302), `/clientes/<uuid>` (302 preservando clienteId).

## 5. Riscos remanescentes

- Sem catálogo real de imóveis, `imovel_codigo` permanece campo textual — busca por código não é indexada por FK.
- Policy de `profiles` mais restrita pode impactar telas que hoje listam qualquer usuário; mitigar mantendo `list_corretores()` RPC (que é SECURITY DEFINER e continua funcionando).
- Concorrência CAS em `transitionStage` muda contrato do erro (nova mensagem "etapa mudou"). Documentar no toast.

## 6. Fora de escopo desta tarefa

- Criar tabela canônica `public.imoveis` (venda). Requer decisão de produto (fonte, campos, sincronização). Fica registrado como próximo passo.
- Deduplicar eventos históricos antigos: só se aparecer evidência (hoje o pior caso é 11 eventos em 1 atendimento por causa da separação por campo, que é o design atual — não é bug).

---

**Arquivos que serão alterados** (na fase build):
- `supabase/migrations/20260724233000_atendimentos_integridade_contextual.sql` (reescrita)
- `src/lib/attendances/attendance-field-mapping.ts` (uso de `imovel_codigo` / `interesse_descricao`)
- `src/lib/attendances/attendances.functions.ts` (CAS em `transitionStage`; leitura de `interesse_descricao`)
- `src/components/atendimentos/AtendimentoFormModal.tsx` (campo de código + observação)
- `src/components/atendimentos/AtendimentoDetailDrawer.tsx` (exibição + novo rótulo `contact_change`)
- `src/components/atendimentos/AtendimentoCard.tsx` (badge de código; wa.me guard)
- `src/routes/_app.atendimentos.tsx` (`validateSearch` + `clienteId`)
- `src/routes/_app.clientes.$clienteId.tsx` (redirect preservando id)
- `src/integrations/supabase/types.ts` (regenerado após migration)
