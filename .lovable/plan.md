## Objetivo
Separar o CRM `Atendimentos` em dois pipelines independentes — **Vendas** e **Aluguéis** — dentro do mesmo módulo, usando a coluna `finalidade` já existente (`compra | aluguel | ambos`) como fonte da verdade, sem duplicar rotas nem quebrar cliente/corretor/imóvel/Agenda/histórico.

## Diagnóstico atual
- `attendances.finalidade` (`compra`/`aluguel`/`ambos`) já é persistido em Supabase e retornado pelo serviço.
- Hoje o hook `useAttendances` mescla os dois em um único funil; `finalidade` é apenas filtro opcional.
- Kanban, summary cards, contadores por etapa e filtros operam sobre o conjunto agregado — não isolam por trilha comercial.
- Registros `ambos` aparecem em ambas as agregações (linhas 321/323 de `useAttendances.ts`).
- Não existe estado de rota para o funil selecionado.

## Mapeamento canônico da trilha comercial
Criar utilitário tipado em `src/lib/atendimentos/track.ts`:
- `type CommercialTrack = "venda" | "aluguel"`
- `finalidadeToTrack(compra) = venda`, `finalidadeToTrack(aluguel) = aluguel`
- Registros `ambos`: exibidos **em ambos os funis** apenas como legado (badge "Interesse duplo"), com regra que impede duplicação de métricas — cada card só conta 1x na trilha ativa, e edições solicitam ao usuário escolher `Venda` ou `Aluguel` para converter o legado. Nenhum split automático em dois cards; a criação nova sempre grava `compra` ou `aluguel`. Migração leve: nenhuma mudança de schema — `ambos` continua permitido, mas o form novo não gera mais esse valor.

## Estado da rota (persistência da seleção)
Adicionar ao `validateSearch` de `/_app/atendimentos`:
```
track: "venda" | "aluguel"  (fallback "venda" quando inválido/ausente)
```
- Persistência automática via URL → sobrevive refresh e back/forward.
- Trocar trilha via `navigate({ search: prev => ({ ...prev, track }) })` sem reload.

## Componentes / arquivos alterados
1. **`src/lib/atendimentos/track.ts`** (novo) — tipo `CommercialTrack`, `finalidadeToTrack`, `matchesTrack(atendimento, track)`, labels/ícones/cor.
2. **`src/hooks/useAttendances.ts`**
   - Aceitar `track` no filtro (não opcional).
   - Filtragem canônica antes de qualquer agregação: `list = all.filter(matchesTrack(track))`.
   - Recalcular `summary`, `byStage`, contadores, KPIs a partir dessa lista já filtrada.
   - Incluir `track` na `queryKey` cache-friendly: `["attendances", { track, ...filters }]` (com filtragem em memória sobre um único fetch autorizado por RLS — sem N+1 e sem quebra de invalidação).
3. **`src/routes/_app.atendimentos.tsx`**
   - Ler `track` do search; passar para hook, filtros, Kanban, cards, empty states.
   - Renderizar novo seletor logo abaixo do header.
   - Preselecionar `finalidade` do form conforme trilha ao abrir "Novo atendimento".
   - Empty states e textos contextuais por trilha.
4. **`src/components/atendimentos/PipelineTrackSelector.tsx`** (novo)
   - Card dedicado com dois segmentos (`Vendas`, `Aluguéis`), ícone, contagem ativa e pendências (retorno vencido) por trilha.
   - Estado selecionado forte (accent azul p/ Vendas, verde p/ Aluguéis), foco/hover, acessível, responsivo (empilha em ≤430px mantendo largura total).
5. **`src/components/atendimentos/AtendimentoFormModal.tsx`**
   - Campo `Tipo de atendimento` obrigatório (`Venda`/`Aluguel`) — grava `finalidade` correspondente.
   - Ao editar registro `ambos`, exigir escolha antes de salvar.
   - Ajuste condicional de rótulos: orçamento vs faixa de aluguel; restrições/mudança quando `aluguel`.
6. **`AtendimentoSummaryCards.tsx`, `AtendimentoKanban.tsx`, `AtendimentoCard.tsx`, `AtendimentoFilters.tsx`, `AtendimentoDetailDrawer.tsx`**
   - Consumir dataset já filtrado por trilha.
   - Card oculta o badge grande de finalidade (contexto vem do seletor); mantém apenas indicação discreta quando `ambos`.
   - Drawer mostra "Este cliente também possui atendimento de {outra trilha}" com link `?track=…&id=…` quando o mesmo `cliente_id` tiver oportunidade na outra trilha.
7. **`src/lib/attendances/attendances.functions.ts`**
   - Validar `finalidade ∈ {compra, aluguel}` na criação (bloquear novo `ambos`).
   - Registrar evento em `attendance_history` (`event_type: 'track_change'`) quando `finalidade` mudar em update.

## Histórico estruturado
Reaproveitar `attendance_history` (já existe trigger). Adicionar linhas descritivas (ex.: "Tipo alterado de Venda para Aluguel por {ator}") via `description` no update — nenhuma migração nova necessária; o trigger `attendances_log_history` já captura mudanças de campos padrão, então incluímos `finalidade` no gatilho existente numa migração pequena para logar `track_change`.

## RLS
Nenhuma alteração. As policies atuais (`created_by`, `corretor_id`, admin, secretaria) continuam autorizando ambas as trilhas. A separação é operacional, não de autorização. Validar manualmente que corretor/secretária/admin veem apenas o que já viam, agora particionado por seletor.

## Estratégia de query/cache
- Um único fetch autenticado por página (`listAttendances`) reutilizado, filtrado em memória por `track` no hook → sem requests duplicados, sem N+1.
- `queryKey` inclui `track` para permitir mutações invalidarem seletivamente (`invalidateQueries({ queryKey: ['attendances'] })` cobre ambos).

## Design
- Seletor: card `rounded-2xl border shadow-sm` com dois segmentos lado a lado (desktop) / empilhados (mobile ≤430px). Selecionado: fundo tonalizado (azul-600/10 para Vendas, emerald-600/10 para Aluguéis), borda accent, chip de contagem.
- Sem recolorir o resto da UI; apenas hairlines/badges por trilha.

## Responsividade validada
320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920 px — seletor sempre visível, Kanban rola horizontal ≥768, empilha etapas ≤430.

## Validação obrigatória (Playwright no preview)
1. Abrir `/atendimentos` → seletor visível, default `Vendas`.
2. Alternar para `Aluguéis` → URL vira `?track=aluguel`, métricas/kanban trocam.
3. Refresh mantém seleção; back/forward navega entre trilhas.
4. Criar 1 atendimento em cada trilha; confirmar isolamento.
5. Mover entre etapas; confirmar contadores.
6. Editar e refresh — permanece na trilha correta.
7. Cliente com registro `ambos` legado aparece em ambos, sem duplicar contagem inflada.
8. Verificar como corretor (Felipe) e admin — visibilidades preservadas.
9. `bun run typecheck` + preview HMR OK.

## Riscos / limitações
- Registros `ambos` continuarão exibidos nos dois funis até edição manual — decisão consciente para não perder rastreabilidade.
- Não introduz nova coluna/enum: reduz risco de migração, mas amarra semântica ao valor `finalidade`.
