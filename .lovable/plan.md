# Sidebar — visual premium "Editorial"

Objetivo: aplicar na barra lateral o design aprovado — paleta petróleo refinada, tipografia Sora + Manrope, ícones soltos (sem quadradinhos) e nomes de menu em uma única linha, sem as descrições abaixo.

## O que muda para o usuário

- Cada item do menu mostra só o nome (ex.: "Agenda"), em uma linha, com mais respiro entre itens.
- Ícones ficam mais leves e elegantes: só o traço, sem caixa atrás; ao passar o mouse, ganham realce discreto.
- O item da página atual ganha uma pílula suave em tom verde-água com uma barrinha de destaque na borda esquerda.
- Títulos das seções (Operação, Relacionamento e Negócios, Gestão e Crescimento) e a marca "Gestão Cordial / Sistema Imobiliário" passam para a fonte Sora, com ar mais editorial.
- Rodapé "Cordial Imóveis • Morar Imóveis" mais discreto e centralizado, com o ponto em verde-água.
- Fundo da barra fica num petróleo mais profundo e uniforme (#35484F), com superfícies elevadas em #3B4F56.
- Botão de recolher/expandir continua igual de funcional; quando recolhida, vira uma coluna só de ícones com divisores entre seções.
- O mesmo visual vale para o menu lateral no celular (drawer).

## Detalhes técnicos

### Fontes
- `src/routes/__root.tsx`: `<link>` para Google Fonts (Sora 600/700, Manrope 400/500/600) com preconnect.
- `src/styles.css`: `--font-display: "Sora"` e ajuste de `--font-sans` para "Manrope".

### Tokens da sidebar (src/styles.css)
- Atualiza os tokens `--app-sidebar-*`: background #35484F, superfícies/hover #3B4F56, acento #79C9B8, texto principal #EEF4F2, textos secundários derivados.
- Contraste: rótulos de seção e textos secundários escolhidos para manter WCAG AA (o teste `sidebar-visual-tokens.test.ts` exige 4.5:1), então ficam um pouco mais claros que no protótipo.

### Componentes
- `src/components/sidebar-menu.tsx`: remove o `<span>` de descrição do item (a descrição continua no tooltip quando a sidebar está recolhida); ícone sem caixa (sem borda/fundo), strokeWidth 1.5 normal e 2 no ativo; classes atualizadas para pílula + barra de acento. Sem cores fixas (o teste proíbe hex/rgba em componentes).
- `src/components/app-shell.tsx`: ajusta marca do cabeçalho (Sora), rodapé editorial e divisores da sidebar recolhida. Nada de lógica de sessão, permissão ou navegação muda.
- `src/components/shared/module-menu.ts`: sem alteração (descrições seguem usadas em tooltips e no menu "Mais").

### Testes e validação
- Rodar os testes de sidebar (`sidebar-visual-tokens`, `sidebar-preference`) e typecheck.
- Verificar no preview (Playwright): sidebar expandida, recolhida e drawer mobile, com capturas de tela.
