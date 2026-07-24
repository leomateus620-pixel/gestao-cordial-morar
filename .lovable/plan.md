# Unificação Clientes → Atendimentos (CRM único)

Consolidar `Clientes` e `Atendimentos` em um único módulo de relacionamento comercial, preservando registros, RLS, rotas, integrações (Agenda, Contratos, Notificações) e permissões atuais.

## 1. Auditoria (antes de codar)

Ler e mapear:
- Rotas: `_app.atendimentos.tsx`, `_app.clientes.tsx`, `_app.clientes.$clienteId.tsx`, `module-menu.ts`, sidebar/drawer/bottom nav.
- Backend: `attendances.functions.ts`, `clients.functions.ts`, RLS de `attendances` e `clients`, triggers `notify_atendimento_corretor` e `mark_attendance_opened`.
- Hooks: `useAttendances`, `useClients`, store (`app-store.ts`).
- Tipos: `types/atendimento.ts`, `types/client.ts`.
- Conversão atual (`convertido_em_cliente`, `cliente_convertido_id`), links com Agenda (`atendimento_id`), Vendas/Contratos e notificações.
- Permissões: `permissions.ts` (`atendimentos`, `clientes`), `access-control.ts`.

Entregar sumário interno antes das mudanças de código.

## 2. Modelo de domínio final

- `clients` = registro canônico da pessoa (perfil durável).
- `attendances` = oportunidade comercial (1 cliente → N atendimentos).
- Novo campo `pipeline_stage` em `attendances` (enum), separado do `status` detalhado.
- Nova tabela `attendance_history` para auditoria estruturada.

### Enum `pipeline_stage`
`primeiro_contato | apresentando_solucao | visita | proposta | fechamento | perdido | arquivado`

### Mapeamento status → stage (backfill idempotente)
- novo, aguardando_retorno, sem_retorno → `primeiro_contato`
- em_atendimento → `apresentando_solucao`
- visita_agendada → `visita`
- proposta_enviada, em_negociacao → `proposta`
- fechado → `fechamento`
- perdido → `perdido`

`perdido`/`arquivado` são terminais fora dos 5 ativos.

### Tabela `attendance_history`
Colunas: `id, attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value(jsonb), new_value(jsonb), metadata(jsonb), source, created_at`.
RLS: leitura para quem tem acesso ao atendimento pai; insert por trigger/RPC (bloquear insert/update/delete direto).

Eventos rastreados: criação, vínculo de cliente, atribuição de corretor, mudança de stage, mudança de status, vínculo de imóvel, agendamento, visita, proposta, nota, edição de perfil do cliente, perda, fechamento, reabertura.

## 3. Migrações Supabase (idempotentes)

1. `CREATE TYPE public.pipeline_stage AS ENUM (...)`.
2. `ALTER TABLE attendances ADD COLUMN pipeline_stage pipeline_stage`.
3. Backfill `pipeline_stage` a partir de `status`.
4. `CREATE TABLE attendance_history` + GRANTs + RLS + policies.
5. Triggers em `attendances` que gravam history em: INSERT, UPDATE de `corretor_id`, `pipeline_stage`, `status`, `imovel_id`, `proximo_retorno`, `proximo_passo`, `cliente_id`.
6. Dedup de clientes criados por conversão (mesmo telefone/email/CPF normalizado + mesmo `created_by`) → apontar `attendances.cliente_id` para o canônico e marcar duplicatas.
7. Índices: `attendances(cliente_id)`, `attendances(pipeline_stage, corretor_id)`, `attendances(proximo_retorno)`, `attendance_history(attendance_id, created_at desc)`.
8. Função `link_or_create_client_for_attendance(payload)` que normaliza telefone/email/CPF, retorna cliente existente ou cria novo, tudo em uma transação com o insert do atendimento.

## 4. Backend / Server Functions

- `attendances.functions.ts`: novo `createAttendanceWithClient` (usa RPC acima); `updateAttendance` grava history via trigger; `listAttendances` retorna `pipeline_stage`, `client` embutido (join) e `next_action` derivado.
- `clients.functions.ts`: manter CRUD; adicionar `findClientByContact({phone,email,document})` para checagem de duplicidade no formulário.
- Nova `listAttendanceHistory({attendanceId})`.
- Remover uso de `convertido_em_cliente` como caminho de criação (manter coluna para retrocompat).

## 5. Rotas e navegação

- Menu: manter apenas `Atendimentos` (descrição: "Relacionamento, clientes e funil comercial"). Remover `Clientes` de sidebar, drawer, bottom-nav, `Mais`.
- `permissions.ts`: qualquer perfil que tinha `clientes` recebe automaticamente `atendimentos` (garantir superset). Manter módulo `clientes` internamente para RLS/consultas.
- Redirects (preservar bookmarks):
  - `/clientes` → `/atendimentos?view=clientes`
  - `/clientes/$clienteId` → `/atendimentos?clienteId=<id>` (abre drawer do cliente)
- Rotas antigas viram `beforeLoad`/`loader` que faz `throw redirect(...)`, sem quebrar deep links de notificações.

## 6. UI — `_app.atendimentos.tsx`

Hierarquia:
1. Header do módulo + ação primária `Novo atendimento`.
2. Busca + filtros (corretor, marca, origem, próximo retorno, prioridade).
3. Seletor de view: `Funil` (default) | `Lista` | `Clientes`.
4. KPIs por stage.
5. Conteúdo por view.

### View Funil
- **Desktop (≥1280px)**: board Kanban de 5 colunas com contagem, overdue e virtualização leve.
- **Desktop médio (1024–1279px)**: seletor de stage + grid adaptativo (evita colunas espremidas).
- **Mobile**: tabs horizontais scrolláveis por stage, 1 stage por vez, cards em coluna, sem overflow.

### View Lista
Tabela densa com stage, status, cliente, corretor, próximo retorno, prioridade.

### View Clientes
Diretório de clientes (inclui clientes sem atendimento ativo). Card → abre drawer de cliente com atendimentos relacionados.

## 7. Card de atendimento (redesign)

Conteúdo: nome + iniciais, stage atual (chip colorido), status detalhado (sutil), finalidade + tipo, bairro, faixa de orçamento, corretor, última interação, próximo retorno (com indicador de atraso), prioridade.
Ações rápidas: abrir, mover stage (menu), agendar, nota, WhatsApp/ligação (quando autorizado). Acessível (foco visível, teclado).

## 8. Formulário unificado `Novo atendimento`

Multi-step com 5 seções (Identificação / Origem / Interesse / Complementares / Próxima ação). Modo:
- **Selecionar cliente existente** (autocomplete por nome/telefone/email/CPF).
- **Novo contato** → ao digitar telefone/email/CPF, dispara `findClientByContact`; se houver match, mostra card do possível duplicado com opções `Vincular` / `Revisar` / `É outro contato`.
Campos obrigatórios mínimos: nome, telefone, finalidade, tipo imóvel, corretor (ou "a definir"), stage inicial.

## 9. Workspace de detalhe

Drawer responsivo (fullscreen no mobile) com abas:
- **Visão geral**: header com cliente/stage/status/corretor + próxima ação.
- **Cliente**: perfil completo (edita in-place com permissão).
- **Interesse comercial**: finalidade, tipo, bairro, orçamento, imóveis vinculados.
- **Histórico**: timeline estruturada (filtrável por tipo, com autor).
- **Ações**: registrar nota, mudar stage/status, atribuir corretor, agendar (link para Agenda pré-preenchido), vincular imóvel, registrar proposta, marcar perdido/fechado, contato WhatsApp/email.
- **Relacionados**: outros atendimentos do cliente, eventos de Agenda, contratos, documentos.

## 10. Queries / State

- Chaves canônicas: `["attendances", filters]`, `["attendance", id]`, `["attendance", id, "history"]`, `["client", id]`, `["client", id, "attendances"]`.
- `listAttendances` retorna cliente embutido (evita N+1).
- Invalidar `attendance` + `attendances` + `attendance history` após mutations.
- Remover leituras via app-store para cliente/atendimento; manter store só para sessão/marca.

## 11. Permissões / RLS

- Manter isolamento atual (corretor vê só seus; secretaria e admin veem tudo da agência).
- `attendance_history`: SELECT via `agenda_can_access`-like helper (`attendance_can_access(id)`); INSERT restrito a triggers/service_role.
- Migração de permissões: perfis com `clientes` ganham `atendimentos` se ainda não têm (nenhum caso hoje, mas garantir idempotência).
- UI oculta não substitui RLS: todas as checagens de duplicidade e criação passam pela RPC.

## 12. Preservação de dados

- Nada é deletado. Duplicatas de cliente identificadas por normalização → merge lógico: `attendances.cliente_id` re-apontado para o canônico; duplicata recebe flag `merged_into` (nova coluna nullable) para auditoria e possível rollback.
- Clientes sem atendimento ativo → view `Clientes` interna.
- Contratos, Agenda events e notificações continuam válidos (usam IDs de atendimento, que não mudam).

## 13. Responsividade

Validar em 320/360/375/390/430/768/1024/1280/1440+.
- Mobile: bottom-nav não sobrepõe, drawers respeitam safe-area, tabs de stage sem clipping.
- Desktop: larguras controladas, cards não esticam além de ~360px.

## 14. Validação visual (obrigatória)

Playwright autenticado (sessão injetada) em cada iteração:
1. Snapshot Atendimentos + Clientes atuais.
2. Após cada grupo de mudanças, abrir preview, capturar mobile+desktop, corrigir.
Cenários: novo contato, cliente existente, telefone duplicado, atendimento sem corretor, retorno atrasado, imóvel vinculado, visita agendada, proposta, fechado, perdido, cliente com múltiplos atendimentos, cliente sem atendimento ativo, nomes longos, loading/erro.

## 15. Testes

- Unit: mapeamento status→stage, normalização de contato, dedup.
- Integration (server fns): `createAttendanceWithClient` (novo/existente/duplicado), transição de stage grava history, RLS por perfil.
- E2E leve: redirects de `/clientes*`, criação via existing client, abertura do drawer.
- Rodar: typecheck, lint, build.

## 16. Ordem de execução

1. Migração SQL (enum, coluna, backfill, history, triggers, dedup, índices, RPC).
2. Server functions + tipos.
3. Redirects de rota + remoção do item de menu (com permissão migrada).
4. UI: página unificada com view Funil (desktop+mobile).
5. Card redesenhado.
6. Formulário unificado com dedup.
7. Drawer de detalhe com abas + histórico.
8. Views Lista e Clientes.
9. Validação visual iterativa + testes + build.

## Riscos

- Backfill de `pipeline_stage` em base grande: mitigar com update em lote.
- Dedup de clientes: usar merge lógico (não deletar) para permitir rollback.
- Triggers de history podem acoplar performance de updates massivos: manter payload mínimo.
- Redirects precisam cobrir notificações e emails já enviados com `/atendimentos?id=...` e `/clientes/...`.

## Entregáveis finais

Auditoria, modelo de domínio, migração+backfill, mapeamento de stages, rotas/nav alteradas, arquivos alterados, implementação de history, impacto em permissões, larguras validadas, evidências visuais, testes e comandos executados, riscos remanescentes.
