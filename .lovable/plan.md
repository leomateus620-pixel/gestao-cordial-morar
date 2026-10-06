# Ícones da barra lateral em dois tons (duotone)

## Objetivo
Dar aos ícones dos menus uma aparência mais rica e premium: preenchimento suave da cor do grupo por baixo + traço mais forte por cima (estilo duotone), mantendo o visual editorial atual (fundo petróleo, cards por seção, pílula ativa deslizante).

## Como fica
- Cada ícone passa a ser desenhado em duas camadas sobrepostas, usando os mesmos ícones de hoje (sem trocar de biblioteca):
  - **Camada de fundo:** o próprio ícone preenchido, em cor suave (mistura da cor do grupo com o fundo, transparência baixa).
  - **Camada de traço:** o ícone normal, com traço levemente mais forte (1.75) na cor clara atual.
- Em repouso: preenchimento sutil, quase um "halo" interno da cor do grupo — os ícones já ficam coloridos o tempo todo.
- Ao passar o mouse: preenchimento ganha mais corpo e a cor do grupo aparece no traço.
- Item ativo: preenchimento mais presente (dois tons bem visíveis) + quadradinho suave que já existe hoje.
- Menu recolhido e drawer do celular usam o mesmo tratamento.

## Mudanças técnicas
1. `src/components/sidebar-menu.tsx` — o espaço do ícone passa a renderizar duas cópias empilhadas do ícone (`position: absolute`), classes novas `app-sidebar-nav-icon-fill` (camada preenchida) e o traço existente; ajuste de strokeWidth.
2. `src/styles.css` — novos tokens de dois tons por seção (opacidade do preenchimento em repouso/hover/ativo, cor do traço), derivados dos acentos que já existem por grupo (`--app-sidebar-card-accent-*`), usando `color-mix` para as camadas suaves.
3. Verificação visual ícone a ícone (Playwright, 19 ícones): se algum ícone ficar "manchado" quando preenchido (ex.: engrenagem, busca), ele recebe exceção com preenchimento próprio (apenas as formas fechadas) ou opacidade menor — decidido olhando as capturas.
4. Tooltip e acessibilidade inalterados; respeito a `prefers-reduced-motion` mantido.

## Validação
- Testes existentes de sidebar (`sidebar-visual-tokens`, `module-menu`) passando.
- `tsgo` limpo e build OK.
- Capturas Playwright: barra expandida, recolhida, item ativo e drawer do celular.
