# Três atualizações nos sites públicos (Cordial e Morar)

## 1. Frase da home (só Cordial)
- `HOME_COPY.cordial` em `HomePage.tsx`: título "Sentir-se em casa." + continuação "Esse é o nosso compromisso com você.", em um único h1 com a hierarquia atual e quebra natural.
- Conferir as três leituras de `HOME_COPY` (abertura, carregamento e versão Morar); Morar e a frase de apoio da Cordial ficam iguais.

## 2. Código do imóvel nas duas abas
- Rótulo "Código do imóvel", placeholder "Digite a referência", sempre visível em Comprar e Alugar, numa linha própria antes do botão principal (desktop centralizado e com largura contida; mobile na largura total, com altura de toque confortável).
- **Cordial (`SearchForm.tsx`)**: no formulário compacto, usar `referenceFields` direto e tirar o botão "Buscar por referência". "Pesquisa completa" e o campo da busca avançada continuam.
- **Morar (`MorarSearchForm.tsx` + `morar-search.ts`)**: levar `referencia` para o formulário compacto; abrir, aplicar ou limpar a gaveta de filtros não apaga o código; `exata` continua igual. Um único campo de código ativo em cada tela.
- O código é tratado como texto, normalizado como o sistema já faz (zeros à esquerda e letras); continua o mesmo ao trocar a finalidade; é enviado pelo botão ou Enter pelo fluxo atual, com as rotas e os parâmetros que já existem. Busca sem resultado mostra "Limpar filtros".

## 3. Troca rápida de fotos nos cards (as duas marcas)
1. **Medir antes de mudar**: rodar o navegador no catálogo Cordial com cache frio e quente e anotar o tempo para trazer a galeria, para baixar a imagem e até a foto aparecer. Ler `http.server.ts` e `media-derivatives.server.ts` antes de propor qualquer mudança no servidor. Só mudo o servidor se a medição apontar para ele, e nesse caso aviso antes.
2. **Lógica compartilhada**: mover a troca de fotos de `PropertyCard` para um hook comum (baseado em `card-gallery.ts`, `loadGallery` e `mediaPath`), usado no catálogo e na vitrine (`HomeCard`) das duas marcas.
3. **Preparar cedo, com limite**: carregar a lista de fotos e a próxima foto ao passar o mouse ou focar; no toque, preparar só a primeira vizinha de poucos cards visíveis, depois das capas. No máximo 2 pedidos ao mesmo tempo, com prioridade para o card em uso, sem repetir pedidos (por marca, imóvel e versão). A URL preparada é a mesma que o navegador vai escolher pelo `srcset`/`sizes`.
4. **Trocar quando a foto estiver pronta**: a foto atual fica até a próxima carregar; foto e contador mudam juntos; aviso discreto de carregamento; se falhar, a foto atual fica e dá para tentar de novo; respostas antigas são ignoradas.
5. **Navegação**: setas acessíveis, teclado e deslizar para o lado no celular sem travar a rolagem para baixo. O link para a ficha, os favoritos e a prévia da Cordial continuam. Cards com 0 ou 1 foto ficam como estão.

## 4. Validação e entrega
- Frase e código nas duas marcas em 360, 390, 768 e 1366 px; código válido, inexistente e vazio; Enter e botão; código mantido no endereço ao voltar ou abrir um link compartilhado; gaveta da Morar.
- Cards de uma e de várias fotos: setas, teclado, deslizar, cliques rápidos, foto com falha, volta à página.
- Tempos de antes e depois (metas: até 300 ms com a foto já preparada e até 1,5 s na primeira troca), mais pedidos e tamanho inicial da página.
- Rodar test:site, test:morar e checagem de tipos; tudo só na prévia, sem publicar e sem mexer em dados, fotos ou integrações.
