
# Parte 1 — Base da identidade visual "Gestão Cordial"

Reskin apenas visual sobre o código existente. Sem mudar rotas, lógica, store, mocks, framework ou estrutura de componentes. Mantém glassmorphism / 3D liquid glass.

## 1. Tokens globais (`src/styles.css`)

Substituir a paleta terracotta atual pela nova paleta no `:root` (mantém formato oklch para compatibilidade com `@theme inline` já existente, mas adiciona também as variáveis hex semânticas pedidas).

Adicionar no `:root`:

```
--system-primary / -dark / -light       (#1E647D / #174D61 / #5FAFC7)
--system-accent / -dark / -light        (#D9782D / #B95F20 / #F0A86D)
--system-graphite / -graphite-soft      (#171B21 / #2A3038)
--system-background / -surface / -border (#F5F1EB / #FBF8F4 / #E6DDD2)
--system-text / -muted / -soft
--cordial-primary / -dark / -light      (#2B7FA3 / #165B73 / #DCEFF5)
--morar-primary / -dark / -light        (#E07A2E / #B95F20 / #FBE4D1)
--success / --warning / --danger / --info / --neutral
```

Remapear os tokens shadcn existentes (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--ring`, `--destructive`, `--card`, `--muted`, `--secondary`) para os novos valores em oklch equivalentes — assim toda a UI shadcn (botões, inputs, badges, sheet, drawer) herda a nova paleta sem reescrever componente por componente.

Adicionar tokens `--cordial` / `--morar` e expor via `@theme inline` como cores Tailwind (`bg-cordial`, `text-morar`, etc.) para uso contextual.

## 2. Fundo geral

Reescrever `MeshBackground` para usar os novos glows:
- base linear-gradient areia → off-white → areia escura
- glow azul-petróleo top-left
- glow cobre/laranja top-right
- glow âmbar suave centro

Mantém o componente, só troca cores e posições.

## 3. Utility classes (`src/styles.css`)

Atualizar `@utility glass-panel` e `glass-panel-strong` para o novo padrão (raio maior implícito via uso, sombras grafite, highlight superior).

Adicionar utilities novas:
```
@utility liquid-panel        — card glass premium
@utility premium-card        — alias semântico
@utility system-gradient     — gradient azul-petróleo → grafite
@utility system-button       — botão primário azul-petróleo
@utility accent-button       — botão cobre/laranja
@utility context-cordial     — borda + acento azul Cordial
@utility context-morar       — borda + acento laranja Morar
@utility sidebar-glass       — fundo grafite glass
@utility bottom-nav-glass    — fundo claro glass para bottom nav
@utility status-badge        — base de badge semântico
```

Nenhuma utility v3 `@layer utilities` — todas seguem `@utility` v4 (compat com regras tailwind4-authoring).

## 4. Login (`src/routes/login.tsx`)

Reskin visual apenas — `login()`, `useSession`, perfis demo, submit, redirect ficam idênticos.

Mudanças:
- fundo grafite profundo com glow azul-petróleo à esquerda e cobre à direita (variante escura do MeshBackground inline)
- card central `glass-panel-strong` mais translúcido, borda clara, sombra profunda
- título "Gestão Cordial" + subtítulo "Painel integrado de gestão imobiliária" + linha menor "Cordial Imóveis + Morar Imóveis"
- inputs com visual glass (mantém estrutura `<input>` atual, ajusta classes)
- botão primário com `system-button` (azul-petróleo)
- texto de perfis demo mantido

## 5. AppShell (`src/components/app-shell.tsx`)

Sem mudar estrutura nem rotas, ajustar classes:

**Sidebar desktop:**
- trocar `glass-panel-strong` por `sidebar-glass` (fundo grafite glass)
- nome "Gestão Cordial" + subtítulo "Sistema Imobiliário"
- rodapé pequeno "Cordial Imóveis + Morar Imóveis"
- item ativo no `SidebarMenu` ganha indicador lateral azul-petróleo (ajuste em `src/components/sidebar-menu.tsx` — só classes)

**Header desktop:** mantém estrutura, troca tokens de cor para sistema (azul-petróleo no eyebrow, cobre em hover de ações).

**Header mobile:** mesma ideia, eyebrow azul-petróleo.

**Bottom nav mobile:**
- aplicar `bottom-nav-glass`
- ícones grafite, ativo azul-petróleo
- ponto/indicador ativo azul-petróleo, accent cobre só em ação principal (FAB já separado, não mexer aqui)

**Drawer mobile (Sheet):** mesma família visual do sidebar mas em variante clara glass.

## 6. AgencySwitcher (`src/components/agency-switcher.tsx`)

Mantém a lógica (`useApp`, `setAgency`, 3 opções). Visual:
- container `glass-panel` segmented com pill animada
- "Todas" → pill `--system-primary`
- "Cordial" → pill `--cordial-primary`
- "Morar" → pill `--morar-primary`
- texto branco no ativo, grafite no inativo

## 7. Cards

Atualizar **apenas o card base** + 1-2 cards de listagem para padronizar; o resto herda via `GlassCard`.

- `src/components/shared/glass-card.tsx`: novo background `liquid-panel` (rgba 0.64 + blur 18px + borda 0.48 + sombra grafite + highlight superior + radius 24px). Variantes existentes preservadas.
- `src/components/shared/metric-card.tsx`: círculo do ícone passa a usar token sistema; tones `success`/`danger` apontam para os novos semânticos.
- `src/components/shared/property-card.tsx`: preço em azul-petróleo, badge finalidade neutro.
- `client-card`, `broker-card`, `contract-card`, `financial-summary-card`: micro-ajuste de cor de detalhe (acento azul-petróleo), sem mudar layout.

Acento contextual via classes utilitárias `context-cordial` / `context-morar` aplicado onde o card já recebe a imobiliária — nesta etapa apenas deixar as classes prontas; aplicação nos cards individuais por imobiliária fica para a etapa de dados.

## 8. Botões

Sem criar componente novo: o shadcn `Button` (já usado) herda do `--primary` remapeado. Para a variante "ação comercial" usar a nova utility `accent-button` aplicada via `className` nos pontos chave (novo atendimento, novo imóvel, etc.) — não trocar agora, só deixar a classe pronta + atualizar `LiquidButton` (`src/components/shared/liquid-button.tsx`):
- `variant: terracotta` renomeado conceitualmente para "primária" (azul-petróleo) — mantém nome da variante por compatibilidade, só troca cores
- adicionar `variant: accent` (cobre)

## 9. Ícones

Padronização leve no `SidebarMenu` (já usa lucide). Círculo de fundo do ícone ativo passa de terracotta para azul-petróleo; sem outras mudanças.

## 10. Validação

1. `bunx vite build` — corrigir qualquer erro
2. Probe visual via curl `/login` e `/` para sanity
3. Conferir que `routeTree.gen.ts` não foi tocado
4. Conferir que nenhum arquivo de rota, store, mock ou sheet foi alterado em lógica

## Arquivos a editar (lista final)

```
src/styles.css                                       (tokens + utilities + glass)
src/components/mesh-background.tsx                   (glows novos)
src/routes/login.tsx                                 (reskin)
src/components/app-shell.tsx                         (classes)
src/components/sidebar-menu.tsx                      (cores ativo)
src/components/agency-switcher.tsx                   (segmented premium)
src/components/shared/glass-card.tsx                 (novo base)
src/components/shared/metric-card.tsx                (tokens)
src/components/shared/property-card.tsx              (preço azul)
src/components/shared/client-card.tsx                (acento)
src/components/shared/broker-card.tsx                (acento)
src/components/shared/contract-card.tsx              (acento)
src/components/shared/financial-summary-card.tsx     (acento)
src/components/shared/liquid-button.tsx              (variante accent)
```

Nenhum arquivo deletado. Nenhuma rota tocada. Nenhuma lógica de negócio mudada.

## Detalhes técnicos

- Tailwind v4: tokens em `:root` + `@theme inline` mapeando para `--color-*` (padrão do template). Novas utilities via `@utility`, nunca `@layer utilities`.
- Glass: usar apenas `backdrop-filter` (sem `-webkit-` manual — Lightning CSS prefixa).
- Cores oklch para os tokens shadcn (mantém formato existente); cores hex apenas nas utilities customizadas onde rgba/gradientes são necessários.
- Nada de remover `--cordial`/`--morar` antigos sem antes substituir referências — vou fazer remap, não delete.

## Fora desta etapa (Parte 2)

- Aplicar `context-cordial`/`context-morar` por registro de imobiliária nos cards de listagem
- Logo gráfica autoral
- Dark mode revisado
- Telas de módulos individuais (financeiro, imóveis, etc.) além do card base
