# Troca de fotos nos cards dos resultados da Cordial (/buscar)

Complemento da rodada anterior. Escopo: só a troca de fotos nos cards de resultados. A Morar é conferida para não piorar, porque o código é compartilhado.

## 1. Medir o fluxo atual (antes de mudar)
- Abrir os resultados a partir de uma busca real de venda, nos imóveis 1398, 1401 e 1391 ou em equivalentes com 4 e com 14–16 fotos.
- Três situações: seta logo que os cards aparecem, seta depois de alguns segundos na página e trocas seguidas. Repetir cada uma em celular (360/390) e computador (1366), com cache frio e com cache quente.
- Para cada clique, uma linha do tempo com:
  - momento do clique;
  - espera na fila da lista de fotos e resposta dela;
  - pedido da foto: tamanho escolhido, bytes, tempo até o primeiro byte;
  - momento em que a foto aparece;
  - se veio do cache do navegador e se o servidor já tinha a versão leve pronta ou precisou gerá-la na hora.
- Hipótese a confirmar com esses dados: a maior parte da espera é o servidor gerando a versão leve da foto no primeiro pedido.

## 2. Preparar a primeira troca quando a grade aparece
- As capas da primeira tela carregam primeiro.
- Quando as capas visíveis estiverem prontas, preparar a lista e a 2ª foto de até 3 cards com várias fotos já na tela. Isso vale para celular sem depender de hover. O gatilho é a visibilidade real e as capas prontas, sem temporizador fixo.
- No computador, aproximar o mouse ou focar a seta adianta o card de interesse. Clicar ou deslizar passa o card para a frente da fila e aproveita o pedido que já estiver em andamento.
- Depois de cada troca, preparar a próxima foto na direção da navegação e, se houver folga, a anterior.
- Fila com limite de pedidos simultâneos e sem pedidos repetidos. Trabalho antecipado ainda na fila é descartado quando mudam os filtros, a página ou os cards visíveis.
- A lista de fotos já obtida é reaproveitada enquanto o card for o mesmo (marca, imóvel e versão). Nada é guardado além do que os dados públicos permitem.

## 3. Mesmo tamanho de foto na preparação e na exibição
- Calcular o tamanho de exibição pela largura real da grade (colunas, espaços, limites e modo lista), para que os cards usem as versões leves (miniatura ou card) e nunca a grande.
- A foto preparada usa exatamente o mesmo endereço e a mesma regra de tamanho que a exibida. Confirmar no navegador que não há download duplicado nem da versão grande.
- Se a medição confirmar que a espera é a geração da versão leve no servidor: preparar as versões leves das fotos dos imóveis publicados por um reprocessamento controlado, usando o processamento, o armazenamento e as chaves por marca e versão que já existem. A retirada de fotos e anúncios continua respeitada. Antes de rodar esse reprocessamento, peço sua autorização e informo quantas fotos ele vai processar.

## 4. Foto e contador sempre juntos
- A foto que está na tela fica separada da foto pedida. A atual continua visível até a nova carregar; então foto e contador mudam juntos, no mesmo formato do card. A seta responde na hora, com um indicador pequeno se houver espera.
- Cliques rápidos ou mudança de direção: vale o último pedido, e respostas atrasadas são ignoradas.
- Se a foto falhar, a atual fica e a seta tenta de novo.
- Continuam iguais: foco do teclado, nomes das setas, favoritos e acesso à ficha. Deslizar para o lado troca a foto sem atrapalhar a rolagem. Anúncio com uma foto mostra só a capa.

## 5. Validar e entregar
- Repetir as medições da etapa 1 nas mesmas condições: mediana, dispersão e número de repetições.
- Metas de laboratório: primeira troca com cache frio até 1,5 s; foto vizinha já preparada até 300 ms.
- Conferir:
  - rede lenta, falha da foto e cliques rápidos;
  - grade e lista, primeira e última foto, setas, teclado, deslizar, rolagem e troca de filtros;
  - bytes iniciais e tempo até as capas aparecerem;
  - a Morar, para garantir que não piorou.
- Rodar test:site, os testes de mídia e catálogo e a checagem de tipos.
- Entregar a causa confirmada, a tabela de antes e depois e os arquivos alterados.
- Tudo só na prévia, sem publicar.

## Detalhes técnicos
- Arquivos: `PropertyCard.tsx`, `useCardPhotos.ts`, `card-gallery.ts` (fila com prioridade, promoção e cancelamento) e `card-photo-preload.ts` (prioridade, anterior/próxima, descarte). `sizes` calculado no `ResultsPage` e passado ao card.
- Leitura obrigatória antes de qualquer mudança no servidor: `http.server.ts` e `media-derivatives.server.ts` (geração sob demanda, tabela `public_site_derivatives`).
- O reprocessamento só acontece com aprovação explícita.
