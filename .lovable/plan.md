
## Objetivo

Separar a Agenda em duas experiências operacionais reutilizando a mesma infraestrutura (`agenda_events` + tabelas filhas), sem duplicar calendário. Fotos passam a ser **compartilhadas para leitura** por todos os usuários operacionais autorizados; edição/cancelamento continuam restritos. Visitas, retornos e compromissos internos mantêm a privacidade atual.

## Estado atual (auditoria)

- Tabela única `agenda_events` com enum `agenda_tipo` já contendo `fotos` e `video` (canônico existe — não precisa duplicar registros).
- RLS via `agenda_can_access(_event_id)`: vê quem é `created_by` / `owner_user_id` / admin / secretaria / participante. **Não há regra por "tipo=foto"** — fotos são privadas hoje.
- Vínculo com Agenciamentos: hoje só existe `agenciamentos.fotos_realizadas` (boolean, sem relação com evento da agenda). Não há coluna `agenciamento_id` em `agenda_events`.
- Rota única `/_app/agenda` renderiza tudo em uma timeline; filtros por tipo já existem.
- Sync Google Calendar por participante já implementada; lembretes automáticos já implementados. Ambos são agnósticos ao tipo — funcionarão para fotos sem mudança.

## Escopo da mudança

### 1. Banco (uma migration)

- `ALTER TABLE agenda_events ADD COLUMN agenciamento_id uuid REFERENCES public.agenciamentos(id) ON DELETE SET NULL` + index.
- Index em `agenda_events(tipo, inicio)` para consultas de fotos.
- Atualizar `agenda_can_access(_event_id)` (SECURITY DEFINER) para incluir: **OU** (`tipo IN ('fotos','video')` **AND** usuário autenticado com role em `admin|secretaria|corretor` **AND** `imobiliaria` compatível com a organização do usuário — hoje o sistema é single-tenant Cordial+Morar, então basta exigir usuário autenticado com uma dessas roles).
- Criar função `agenda_can_edit(_event_id)` já existe — **manter inalterada**. Ela continua restringindo edição/cancelamento a criador/responsável/admin/secretaria, o que já cobre o requisito de "edição restrita" para fotos.
- Política SELECT em `agenda_events`: já usa `agenda_can_access` — herda a nova regra automaticamente.
- Backfill: nenhum registro precisa migrar (tipo `fotos` já existe).

### 2. Backend (server functions)

- `listAgendaEvents({ scope?: "geral" | "fotos" })`: filtro server-side por `tipo IN ('fotos','video')` ou `tipo NOT IN (...)`. Uma query por view, cache keys separadas.
- `upsertAgendaEvent`: aceitar `agenciamentoId` no input; persistir em `agenda_events.agenciamento_id`.
- Quando `tipo='fotos'` e `agenciamentoId` presente, após concluir/cancelar, atualizar `agenciamentos.fotos_realizadas` (concluir=true; cancelar/reagendar não alteram) via update simples no mesmo handler.

### 3. Tipos e hooks

- `AgendaEvent`/`AgendaEventInput`: adicionar `agenciamentoId?: string`.
- `useAgenda(query, filters, { scope })` — dois query keys: `["agenda","events","geral"]` e `["agenda","events","fotos"]`.
- Stats separadas: para fotos → `hoje | próximos 7 dias | agendadas | pendentes | concluídas | reagendadas`.

### 4. Rotas e navegação

- `/_app/agenda` (existente) → **Visitas e compromissos** (mantém componentes atuais; remove `fotos`/`video` do filtro de tipo).
- Nova `/_app/agenda.fotos.tsx` → **Agenda de fotos** (novo header, KPIs próprios, filtros focados, form de agendamento com seletor de agenciamento e imóvel).
- Sidebar/mobile nav: agrupar "Agenda" com dois itens filhos ("Visitas e compromissos", "Fotos"). Ícone câmera para fotos.

### 5. Componentes reutilizados vs. novos

- Reutilizar: `AgendaTimeline`, `AgendaEventCard` (com pequenos ajustes para exibir agenciamento/código do imóvel quando `tipo='fotos'`), `AgendaFormModal` (adicionar campo agenciamento; ocultar campos irrelevantes quando `tipo='fotos'`).
- Novos: `FotosSummaryCards` (KPIs próprios), `FotosFilters` (data, responsável, status, imobiliária, imóvel, agenciamento), `FotosCreateCard`.
- Integração Agenciamentos: no `AgenciamentoDetailDrawer`/`AgenciamentoCard`, botão "Agendar fotos" que abre o mesmo modal pré-preenchido (`tipo='fotos'`, `agenciamentoId`).

### 6. Notificações & Google Calendar

- Sem mudança estrutural — sistemas atuais já disparam por responsável/participantes/criador. Adicionar responsáveis do agendamento de fotos como participantes garante notificações corretas.
- Deep link de notificações de fotos → `/agenda/fotos?id=<event_id>`.

### 7. UI/Visual

- **Visitas**: mantém identidade teal atual.
- **Fotos**: header com accent fotográfico contido (ícone câmera, badge diferenciada). Reusar `glass-panel` e paleta existente — sem novas dependências visuais.

## Detalhes técnicos

- Migration única SQL: `ADD COLUMN`, index, `CREATE OR REPLACE FUNCTION agenda_can_access` com lógica ampliada, sem quebrar chamadores existentes.
- RLS herda automaticamente porque as policies existentes já usam a função `agenda_can_access` / `agenda_can_edit`.
- Cache: `queryClient.invalidateQueries({ queryKey: ["agenda"] })` invalida ambas as views.
- Tenant: sistema é single-tenant com duas marcas (Cordial/Morar); "organização autorizada" = filtro por `imobiliaria` já existente no schema. Não é necessário `tenant_id` novo.
- Sem realtime novo; polling/refetch atual é suficiente.

## Validação (obrigatória em preview Lovable)

1. Admin: cria evento tipo `fotos` vinculado a um agenciamento em `/agenda/fotos`.
2. Corretor B (não é criador, não é responsável): logar e confirmar que **vê** o agendamento em `/agenda/fotos` mas **não** aparece em `/agenda` (visitas).
3. Corretor B: tentar editar → botão desabilitado; tentar cancelar → bloqueado por RLS (`agenda_can_edit`).
4. Criar visita privada; confirmar que corretor B **não** vê.
5. Concluir agendamento de fotos → `agenciamentos.fotos_realizadas` vira `true`; indicador atualizado.
6. Reagendar → notificação enviada ao responsável, evento Google Calendar atualizado (não duplicado).
7. Testar em 375px, 768px e 1440px; verificar mobile nav não sobrepõe conteúdo.
8. KPI de fotos clicável → filtra lista corretamente.

## Arquivos afetados (estimativa)

- Nova migration SQL.
- `src/types/agenda.ts`, `src/lib/agenda/agenda.functions.ts`, `src/hooks/useAgenda.ts`, `src/services/agenda.ts`.
- `src/routes/_app.agenda.tsx` (ajustar título/filtro de tipos), **novo** `src/routes/_app.agenda.fotos.tsx`.
- `src/components/agenda/AgendaFormModal.tsx`, `AgendaEventCard.tsx`, `AgendaFilters.tsx`.
- **Novos**: `src/components/agenda/FotosSummaryCards.tsx`, `FotosFilters.tsx`, `FotosCreateCard.tsx`.
- `src/components/sidebar-menu.tsx` e mobile nav (grupo Agenda com dois itens).
- `src/lib/agenciamentos/agenciamentos.functions.ts` (opcional: helper para consultar evento de fotos vinculado).
- `src/components/agenciamentos/AgenciamentoDetailDrawer.tsx` (botão "Agendar fotos").

## Fora de escopo

- Multi-tenant real (organização como entidade separada) — sistema segue single-tenant Cordial/Morar.
- Alterações no fluxo de sincronização Google Calendar (já funcional).
- Alterações no motor de lembretes automáticos (já funcional).

## Critérios de aceite

Todos os itens da seção 17 do briefing atendidos, com validação manual no preview em roles admin, secretaria e corretor.
