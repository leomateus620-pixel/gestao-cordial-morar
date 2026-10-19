# Destaques do site Cordial: 5 mais recentes

## O que muda
A seção "Imóveis em destaque" da página inicial do site Cordial passa a mostrar sempre os 5 imóveis publicados mais recentemente, automaticamente. A escolha manual de destaques na administração do site deixa de valer para esta seção (a foto principal do topo continua como está).

## Como
- Na página inicial (`src/routes/site.index.tsx`), trocar a origem dos destaques: em vez da lista escolhida (`featuredPropertyIds`) ou do filtro `destaque: "sim"`, carregar o catálogo com `ordem: "recentes"` e usar só os 5 primeiros.
- Conferir que a ordem "recentes" usa a data em que o imóvel entrou no site; se usar outra data, ajustar só a ordenação da página inicial.
- Conferir que o card mostra até 5 itens sem quebrar o layout.
- Sem mudanças no banco, nos imóveis ou no site Morar.

## Verificação
Abrir a página inicial e conferir que aparecem 5 imóveis, do mais novo para o mais antigo.
