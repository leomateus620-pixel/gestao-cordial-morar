## Objetivo
No grupo **Imóveis** da sidebar, remover os itens "Todos os imóveis" e "Disponibilidade / status" e substituir por dois links externos diretos para os sites das imobiliárias (Cordial e Morar), reaproveitando as URLs já usadas na tela de Início (`real-estate-site-preview-section.tsx`).

## O que será feito

### 1. `src/components/sidebar-menu.tsx`
- Adicionar suporte a item filho externo no tipo `NavigationChild`: campo opcional `href` (string) + `external?: boolean`. Quando presente, em vez de renderizar `<Link>`, renderiza `<a href target="_blank" rel="noopener noreferrer">` mantendo o mesmo visual.
- Importar ícones `Globe` (ou `ExternalLink`) do `lucide-react` para representar sites externos.
- Substituir os filhos do grupo "Imóveis":
  - Remover `Todos os imóveis` e `Disponibilidade / status`.
  - Adicionar `Cordial Imóveis` → `https://www.cordialimoveis.com/`
  - Adicionar `Morar Imóveis` → `https://www.imobiliariamorarimoveis.com.br/`
  - Manter `Agenciamentos` como está.
- Ajustar `isRouteActive` / filtros de módulo para ignorar itens externos (não têm `to` interno) — links externos sempre visíveis para quem enxerga o grupo Imóveis.

### 2. Nada a alterar fora da sidebar
- Rotas `/imoveis`, `/imoveis/$imovelId`, `/imoveis-destaque` permanecem intactas — ainda são referenciadas por clientes e contratos.
- Tela de Início e o componente `real-estate-site-preview-section.tsx` continuam funcionando como hoje.

## Observação
Os links abrem em nova aba; o ícone de cada item será o logo/marca genérica de site para deixar claro que é acesso externo.
