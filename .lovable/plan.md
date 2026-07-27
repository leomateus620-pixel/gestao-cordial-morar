## Diagnóstico

O refactor anterior criou `/agenda/fotos` como rota separada, adicionou entrada em `module-menu.ts`, mas **não foi conectado ao `sidebar-menu.tsx`** (só existe uma entrada "Agenda" apontando para `/agenda`). Consequência: usuários não têm como navegar entre as duas áreas, e a página `/agenda` continua parecendo o módulo original unificado (mesmo já filtrando fora eventos de foto no backend via `scope: "geral"`).

Além disso, mesmo em `/agenda`, `AgendaSummaryCards` ainda exibe o card "Fotos/Vídeos", reforçando a percepção de que nada mudou.

## Correção

### 1. Segmented control no topo da Agenda
Criar `AgendaViewSwitcher` (segmented control com 2 opções: "Visitas e compromissos" / "Agenda de fotos", com ícones `CalendarCheck2` e `Camera`, estado ativo forte, keyboard nav, foco visível, touch >=44px, responsivo). Renderizado no topo de **ambas** as rotas (`_app.agenda.tsx` e `_app.agenda.fotos.tsx`), usando `Link` do TanStack para trocar rota sem full reload. Refresh/back/forward preservam naturalmente (rota real).

### 2. Sidebar / navegação mobile
Em `sidebar-menu.tsx`, substituir a entrada única "Agenda" por um grupo com dois filhos:
- `Visitas e compromissos` → `/agenda`
- `Agenda de fotos` → `/agenda/fotos`

Verificar navegação mobile (bottom nav / mais) e ajustar se necessário.

### 3. Métricas contextuais
`AgendaSummaryCards` hoje é fixo. Torná-lo variant-aware:
- **Geral**: Hoje, Próximos 7 dias, Visitas, Retornos, Assinaturas, A confirmar (remover Fotos/Vídeos).
- **Fotos**: Fotos hoje, Próximos 7 dias, Agendadas, Pendentes, Concluídas, Reagendadas.

`useAgenda` já retorna `stats` diferente por scope (`getPhotoStats` vs `getAgendaStats`); ajustar `getPhotoStats` para produzir as chaves corretas e passar `variant` para o card.

### 4. Header dedicado da Agenda de fotos
Já existe hero fúcsia em `_app.agenda.fotos.tsx`. Manter, mas remover o `AgendaCreateCard` genérico e substituir por CTA "Agendar fotos" no próprio hero. Ajustar empty states para as strings exigidas:
- "Nenhuma sessão de fotos agendada neste período."
- "Agende uma sessão de fotos para que ela apareça aqui."

Cartões de evento (via `AgendaTimeline`/`AgendaEventCard`) já mostram data, hora, imóvel, responsável, imobiliária, status. Verificar que `agenciamentoId` está exibido quando presente; adicionar link para o agenciamento se houver.

### 5. Backend / RLS
Já implementado no refactor anterior:
- `agenda_can_access` permite qualquer role operacional (admin, secretaria, corretor) ler eventos `fotos`/`video`.
- `agenda_can_edit` mantém edição restrita.
- `listAgendaEvents` aceita `scope` e filtra por tipos.
- Coluna `agenciamento_id` existe.

**Verificar** com `supabase--read_query` que RLS realmente broadening está aplicada em produção; se não, reaplicar migração.

### 6. Integração Agenciamentos
Já existe. Validar: ao concluir evento foto/vídeo com `agenciamento_id`, atualiza `agenciamentos.fotos_realizadas` (via `completeAgendaEvent`). Se a lógica não estiver conectada, adicioná-la em `completeAgendaEvent`.

### 7. Google Calendar / notificações
Não alterar. Fluxo atual preservado — eventos de foto continuam sincronizando pelo responsável, não pelos viewers (visibility compartilhada é read-only, não gera notificação/sync duplicado).

### 8. Deep-links
`/agenda` e `/agenda/fotos` são rotas estáveis; links de notificação continuam válidos. Nenhum link antigo quebra.

## Detalhes técnicos

**Arquivos a editar:**
- `src/components/agenda/AgendaViewSwitcher.tsx` (novo) — segmented control.
- `src/components/agenda/AgendaSummaryCards.tsx` — aceitar prop `variant: "geral" | "fotos"` e mudar items + labels.
- `src/routes/_app.agenda.tsx` — renderizar `AgendaViewSwitcher` no topo; passar `variant="geral"` aos cards.
- `src/routes/_app.agenda.fotos.tsx` — renderizar switcher; passar `variant="fotos"`; substituir `AgendaCreateCard` por CTA no hero; empty states dedicados.
- `src/hooks/useAgenda.ts` — ajustar `getPhotoStats` para retornar as chaves `agendadas/pendentes/concluidas/reagendadas` (ou manter as chaves atuais e mapear no card).
- `src/components/sidebar-menu.tsx` — grupo com dois filhos.
- `src/components/agenda/AgendaEventCard.tsx` (leve) — badge/link para agenciamento se `agenciamentoId`.

**Validação:**
- `tsgo` typecheck.
- Playwright: abrir `/agenda`, confirmar switcher visível e "Visitas" selecionado, mudar para "Fotos", refresh, back/forward.
- Query no Supabase para confirmar RLS e coluna `agenciamento_id`.
- Screenshots em 390px e 1280px.

## Fora de escopo
- Não redesenhar `AgendaFormModal`.
- Não mexer em Google Calendar sync.
- Não migrar dados existentes.
