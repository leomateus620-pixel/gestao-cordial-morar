## Objetivo
Reformular o menu lateral (`SidebarMenu`) do Gestão Cordial para uma experiência mais visual, responsiva e tipograficamente refinada, agrupando todos os módulos por área e incluindo o menu **Marketing**, que hoje não aparece.

## Escopo
Somente apresentação (frontend). Nenhuma alteração em rotas, hooks, dados ou permissões — apenas a estrutura visual e a composição do menu.

## Alterações

### 1. `src/components/sidebar-menu.tsx`
- **Nova estrutura por grupos** (ordem, todos com ícone e cor próprios):
  - **Painel** → Início
  - **Agenda** (item direto)
  - **Relacionamento** → Atendimentos, Clientes
  - **Imóveis** → Site Cordial, Site Morar, Agenciamentos
  - **Negócios** → Aluguéis, Vendas, Contratos
  - **Gestão** → Corretores, Financeiro, Relatórios
  - **Crescimento** *(novo grupo)* → **Marketing**, Documentos, Integrações
  - **Sistema** → Configurações
- Incluir `Marketing`, `Documentos`, `Integrações` e `Configurações` (hoje ausentes da sidebar) usando os mesmos ícones/labels já definidos em `module-menu.ts`.
- Mantém filtro por permissões (`getVisibleModules`) e a lógica de rota ativa.

### 2. Refinamento visual (mesmo arquivo)
- **Tipografia**: título do grupo com `text-[13px] font-semibold tracking-[-0.01em]`, descrição em `text-[10.5px] uppercase tracking-[0.14em] text-white/38`; subitens em `text-[13px] font-medium` com espaçamento aumentado.
- **Ícones por grupo**: cada grupo ganha um "chip" quadrado 36px com gradiente sutil e cor de accent própria (indigo, teal, amber, rose, emerald, violet, slate) — sem ícones genéricos repetidos.
- **Divisor por seção**: label pequena de seção (`Operação`, `Relacionamento & Negócios`, `Gestão & Crescimento`, `Sistema`) em `text-[10px] uppercase tracking-[0.22em]` separando visualmente os blocos.
- **Estado ativo**: barra vertical + halo de cor do próprio grupo (não mais só ciano genérico).
- **Hover/foco**: transição de 180ms, `translate-x-[1px]` sutil, ring `ring-1 ring-white/8`.
- **Responsividade**: mantém modo `collapsed` (icon-only 64px) no desktop; no mobile o `AppShell` já abre a sidebar como drawer — apenas garantir `overflow-y-auto` fluido e `text-[13px]` estável em telas <380px.

### 3. Sem alterações
- `src/components/shared/module-menu.ts` (fonte de verdade dos módulos).
- `src/components/app-shell.tsx` (drawer/breakpoints).
- Rotas, permissões, hooks, tokens globais de tema.

## Validação
- Typecheck do build.
- Conferência visual em `/agenda` (desktop 1280 e mobile 375) confirmando: 8 grupos visíveis, Marketing presente, tipografia refinada, estado ativo colorido por grupo, colapso funcional.
