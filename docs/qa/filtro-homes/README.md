# Busca nas homes da Cordial e da Morar

Comparação realizada em 28/11/2026. A coluna esquerda de cada imagem mostra a home publicada antes da alteração. A direita mostra a aplicação local com os mesmos recursos públicos da respectiva marca. Cada metade preserva as dimensões originais do viewport em pixels CSS.

| Viewport | Cordial, antes → depois | Morar, antes → depois |
| --- | --- | --- |
| 1440 × 900 | [560 × 488 → 560 × 469](cordial-1440.webp) | [680 × 648 → 560 × 469](morar-1440.webp) |
| 360 × 800 | [296 × 456 → 320 × 445](cordial-360.webp) | [292 × 579 → 320 × 445](morar-360.webp) |
| 390 × 844 | [326 × 456 → 350 × 445](cordial-390.webp) | [322 × 579 → 350 × 445](morar-390.webp) |

As medidas são do formulário sem filtros adicionais, arredondadas ao pixel. O card cresce para acomodar a localização, uma faixa longa ou ações em mais de uma linha. A 320 px, as duas marcas também ficaram sem rolagem horizontal.

## Percursos pelo catálogo público

O navegador abriu a home de cada marca e usou os controles visíveis para escolher apartamento, cidade e bairro, teto digitado, dormitórios, banheiros e vagas. O teste conferiu a finalidade e os parâmetros da URL, o total do contador, a quantidade na listagem e os identificadores dos imóveis exibidos, na ordem retornada pela API pública da marca. Os números abaixo correspondem ao catálogo no momento da consulta.

| Percurso | Critérios em Santa Rosa | Resultado conferido |
| --- | --- | --- |
| Cordial · Compra | Bairro Centro, até R$ 650 mil, exatamente 2 dormitórios, 2 banheiros e 1 vaga | 3 imóveis, referências 1466, 1465 e 1226 |
| Morar · Compra | Mesmos critérios | 4 imóveis, referências 3462, 3461, 2778 e 2550 |
| Cordial · Aluguel | Bairro Timbaúva, até R$ 1.600/mês, pelo menos 2 dormitórios, 1 banheiro e 1 vaga | [Filtro preenchido e imóvel 1459](cordial-aluguel.webp) |
| Morar · Aluguel | Mesmos critérios | [Filtro preenchido e imóvel 3455](morar-aluguel.webp) |

Nos quatro percursos, a busca exclusiva pelo código retornou o imóvel esperado. Um código inexistente retornou zero. O botão Voltar restaurou a consulta na home, inclusive o código sem resultado. A troca de modalidade limpou os dois limites de preço e manteve os critérios compatíveis. A matriz de aluguel também foi repetida nas larguras de 360 e 390 px.

Com emulação de toque a 360 px, foram verificadas a seleção de cidade inteira, a edição dos limites de valor, a aplicação e a reabertura de Mais filtros, o fechamento por Escape e a devolução do foco. Os controles visíveis do card tinham altura mínima de 44 px. [Painel de orçamento nas duas marcas](orcamento-360.webp)

## Implementação e testes

As homes em `/site` e `/site-morar` renderizam `HomeHero → SearchForm → CatalogSearchForm`. Cada marca navega para sua rota de resultados existente, exposta como `/buscar` no domínio público. A Cordial usava um formulário compacto próprio e o link de pesquisa completa descartava as escolhas. A Morar mantinha os espaços em uma das duas colunas da grade. Agora as duas homes compartilham o formulário, a configuração da marca seleciona a rota e a API, e o histórico do navegador guarda a consulta na entrada da home.

O endereço de busca continua usando `cidade` e `bairro` (incluindo loteamentos cadastrados nessa faceta), `referencia`, `precoMin`, `precoMax`, as três contagens e `contagem=minima|exata`. Os limites de preço são independentes. O catálogo e a contagem usam os mesmos critérios normalizados.

Validação local com Chrome/Playwright, TypeScript, `bun run test:morar`, `bun run test:site`, `bun run test` e `bun run build`. Os testes de interação em `tests/morar-site/search.interaction.tsx` cobrem as duas marcas, inclusive desambiguação de bairros, mínimo isolado, teto digitado, campos inválidos, foco, retorno pelo histórico e respostas fora de ordem.
