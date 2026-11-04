# Busca da abertura Morar mais organizada

Alteração somente visual na caixa de busca da primeira tela do site Morar. A Cordial e o funcionamento da busca não mudam.

## O que muda
1. **Quero comprar / Quero alugar**: em vez de dois botões soltos, um seletor único em formato de pílula. A opção ativa fica laranja escuro com texto branco; a outra, grafite sobre fundo claro. Os dois ficam bem legíveis.
2. **Filtros em uma linha organizada**: "Tipo de imóvel", "Onde morar", "Seu orçamento" e "Espaços" ficam em cartões menores, com altura de cerca de 48px, ícone ao lado do texto e o texto numa única linha, sem cortar palavras. "Mais filtros" vira um botão discreto só com ícone e texto curto. No computador a grade fica com 2 colunas × 2 linhas mais o botão, ou com 4 itens em linha quando houver espaço, sempre sem quebrar palavras.
3. **Ícones menores e mais nítidos**: 16px, com traço mais fino, dentro de um pequeno círculo laranja-claro para manter o contraste com o vidro.
4. **Fundo em vidro translúcido** (liquid glass): branco com transparência e desfoque, borda clara e sombra suave. Os textos ficam em grafite forte para manter boa leitura.
5. **Rodapé da busca**: "Limpar filtros" e "33 imóveis disponíveis" ficam juntos à esquerda, em texto pequeno; "Encontrar meu lugar" fica à direita, com a mesma altura dos filtros.
6. **Primeira tela**: caixa um pouco mais estreita (cerca de 520px) e espaçamentos uniformes, para a foto aparecer mais. No celular, o seletor ocupa a largura toda e os filtros ficam em 2 colunas.

## Conferência
Capturas em 1366, 1920 e 390px, além de verificar que a Cordial continua igual.

## Detalhes técnicos
- Somente CSS em `morar.css`, com escopo em `.morar-site .cs-hx-search`: `.ms-search-purpose`, `.ms-filter-row`, `.ms-filter-trigger` (white-space: nowrap, text-overflow: ellipsis, ícone em pílula de 28px) e `.ms-search-actions`.
- Usar `backdrop-filter` sem o prefixo `-webkit-`, com alternativa opaca via `@supports not (backdrop-filter)`.
