## Objetivo

Refinar o RBAC do Gestão Cordial Morar para que `corretor` e `secretaria` operem com segurança, sem ver insights financeiros/executivos, e sem acessar módulos proibidos por URL direta. Admin permanece inalterado.

## 1. Camada central de acesso

**Atualizar `src/lib/mock/permissions.ts`:**
- `corretor.modules`: `["dashboard","atendimentos","clientes","agenciamentos"]`
- `corretor.permissions`: leitura/escrita de atendimentos, clientes, agenciamentos + `agenda:write` interna (para criar visita a partir do atendimento)
- `secretaria.modules`: `["dashboard","atendimentos","clientes","marketing"]`
- `secretaria.permissions`: leitura/escrita de atendimentos, clientes, marketing + `agenda:write` interna
- `admin_owner` e `financeiro_admin` inalterados

**Criar `src/lib/access-control.ts`:**
```ts
isAdminUser(session)
canSeeFinancialInsights(session)   // admin_owner + financeiro_admin
canSeeAdminInsights(session)       // admin_owner
canAccessModule(session, module)
getAllowedModulesForProfile(profile)
getPrimaryMobileModulesForProfile(profile)
```
Usa `UserProfile`/`AppModule` já existentes. Todos os checks de perfil espalhados passam por este helper.

## 2. Navegação (sidebar, bottom nav, /mais)

**`src/components/shared/module-menu.ts`:** adicionar campo `primaryFor?: UserProfile[]` para permitir bottom nav por perfil. Manter `moduleItems` como fonte única.

**`src/components/sidebar-menu.tsx` e `app-shell.tsx`:** filtrar itens via `getAllowedModulesForProfile(session.profile)`. Grupos vazios desaparecem. Estilos preservados.

**Bottom nav mobile (dentro de `app-shell.tsx`):**
- corretor: Início, Atend., Clientes, Agenc., Mais
- secretaria: Início, Atend., Clientes, Marketing, Mais
- admin: mantém atual

**`src/routes/_app.mais.tsx`:** listar apenas módulos permitidos.

## 3. Proteção de rotas

**Criar `src/components/auth/RequireModuleAccess.tsx`:**
- Recebe `module: AppModule`.
- Admin passa direto.
- Se não permitido, renderiza card "Acesso restrito" com botão para `/`.
- Sem redirect loops, sem crash.

Aplicar em wrappers das rotas: `_app.agenciamentos`, `_app.marketing`, `_app.financeiro`, `_app.relatorios`, `_app.vendas`, `_app.alugueis`, `_app.contratos`, `_app.corretores`, `_app.configuracoes`, `_app.integracoes`, `_app.documentos`, `_app.imoveis`, `_app.agenda`.

Não editar `routeTree.gen.ts`.

## 4. Ocultar insights sensíveis

- **`AtendimentoSummaryCards.tsx`**: prop `canViewFinancialInsights`. Oculta "Ticket médio" para não-admin. Passar do route via helper.
- **`RentalKpiCards.tsx`**: prop `canViewFinancialInsights`. Oculta "Receita mensal" para não-admin.
- **`_app.agenciamentos.tsx`**: para corretor, esconder `AgenciamentoSummaryCards`, `AgenciamentosQuickStrip`, `AgenciamentosRanking` e controles de validação admin. Mostrar apenas lista dos próprios registros + header simples.
- **Marketing** (`MarketingKpiCards`, `MarketingCharts`, `MarketingCampaignCard`, `CampaignDetailsDrawer`): prop `canViewFinancialInsights`. Ocultar: Investimento total, Custo por lead, ROI, budget, custos. Manter: leads, cliques, acessos, views, campanhas ativas, canal, região, status. Fluxo de criação/edição intacto.
- **`_app.index.tsx`**: para corretor/secretaria, dashboard operacional limitado — sem `FinancialSummaryCard`, previsões, cobranças, inadimplência, comissão, performance ranking. Atalhos:
  - corretor: Atendimentos, Clientes, Agenciamentos
  - secretaria: Atendimentos, Clientes, Marketing
- Admin dashboard inalterado.

## 5. Ownership no servidor

Atualizar server functions para filtrar por ownership quando o usuário não for admin (`has_role` RPC, já usado em agenciamentos):

- **`attendances.functions.ts`** (list/update/delete): `created_by = userId OR corretor_id = userId` para não-admin.
- **`clients.functions.ts`**: `created_by = userId OR assigned_broker_id = userId` para não-admin.
- **`agenciamentos.functions.ts`**: já valida validação admin-only; reforçar list para `created_by = userId OR corretor_id = userId` quando não-admin.
- **`marketing.functions.ts`**: para secretaria, filtrar por `user_id = userId` (list/update/delete). Admin vê tudo.

Manter `createServerFn + requireSupabaseAuth`. Sem service role. RLS existente preservada.

## 6. UI safety

- Nenhum espaço em branco onde cards foram removidos (grids adaptam automaticamente via `grid-cols` já responsivas; ajustar contadores quando necessário).
- Sem overflow horizontal em mobile.
- Formulários preservam campos de valor (registro precisa deles); só insights agregados são ocultados.

## Arquivos afetados

**Criar:**
- `src/lib/access-control.ts`
- `src/components/auth/RequireModuleAccess.tsx`

**Editar:**
- `src/lib/mock/permissions.ts`
- `src/components/shared/module-menu.ts`
- `src/components/sidebar-menu.tsx`
- `src/components/app-shell.tsx`
- `src/routes/_app.mais.tsx`
- `src/routes/_app.index.tsx`
- `src/routes/_app.atendimentos.tsx` + `AtendimentoSummaryCards.tsx`
- `src/routes/_app.agenciamentos.tsx`
- `src/routes/_app.marketing.tsx` + `MarketingKpiCards.tsx`, `MarketingCharts.tsx`, `MarketingCampaignCard.tsx`, `CampaignDetailsDrawer.tsx`
- `src/routes/_app.alugueis.tsx` + `RentalKpiCards.tsx`
- Todas rotas restritas para envolver com `RequireModuleAccess`
- `src/lib/attendances/attendances.functions.ts`
- `src/lib/clients/clients.functions.ts`
- `src/lib/agenciamentos/agenciamentos.functions.ts`
- `src/lib/marketing/marketing.functions.ts`

## Validação

- Build + typecheck.
- Testar manualmente com 3 sessões (admin / corretor / secretaria): navegação desktop, mobile, /mais, URLs diretas bloqueadas, cadastros funcionando, cards sensíveis escondidos, admin inalterado.

## Fora de escopo

- Redesign visual.
- Novos módulos.
- Alteração de RLS/migrações (o filtro por ownership é aplicado nas server functions; RLS existente continua como segunda barreira).
- Mudanças em `financeiro_admin`.
