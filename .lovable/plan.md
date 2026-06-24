# Resumo compacto de Agenciamentos no Dashboard

Atualmente os 6 cards de resumo dos Agenciamentos (Agenciamentos no mês, Pendentes validação, Fotos no Drive, Placas instaladas, No site, Validados) só aparecem dentro de `/agenciamentos`, ocupando bastante espaço em grid 2×3 / 3×2.

A página inicial (`/_app/`) hoje mostra um `AgenciamentosTeamCard` (ranking dos top 3 corretores por agenciamentos), mas não os indicadores operacionais em si.

## O que será feito

1. **Novo componente `AgenciamentosQuickStrip`** em `src/components/agenciamentos/AgenciamentosQuickStrip.tsx`
   - Faixa horizontal com scroll-snap (mesmo padrão visual de `AgendaSummaryCards` / `AtendimentoSummaryCards`): cartões finos lado a lado, ícone + número + label curta.
   - Os mesmos 6 indicadores da versão atual, lendo `AgenciamentoSummary`.
   - Cada cartão vira `<Link to="/agenciamentos">` para acesso rápido ao módulo completo.
   - No desktop (`lg+`) vira grid de 6 colunas; no mobile/tablet rola horizontalmente sem quebrar a largura da página.

2. **Integrar no Dashboard** (`src/routes/_app.index.tsx`)
   - Renderizar `AgenciamentosQuickStrip` logo após o `MetricsCarousel`, antes do bloco financeiro.
   - Reutilizar o `agenciamentosSummary` já disponível via `useAgenciamentos({ skipDashboard: !isAdminOwner })`.
   - Exibir para admin_owner (que enxerga a carteira completa) e também para corretor, usando seu próprio `summary` quando não-admin — uma única chamada de hook já cobre os dois cenários.
   - Cabeçalho discreto "Agenciamentos" com link "Ver tudo →" para `/agenciamentos`.

3. **Manter a página `/agenciamentos` intacta**
   - Os cards grandes do `AgenciamentoSummaryCards` continuam na página dedicada (visão detalhada). Apenas duplicamos a informação no Dashboard em formato resumido — não remove nada de lá.
   - O `AgenciamentosTeamCard` (ranking) na home permanece como está.

## Arquivos

- **Novo:** `src/components/agenciamentos/AgenciamentosQuickStrip.tsx`
- **Editado:** `src/routes/_app.index.tsx` (importar e posicionar o componente)

Nenhuma mudança em hooks, banco, RLS, server functions ou tipos. Apenas apresentação no frontend.
