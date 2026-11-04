# Site Morar — conclusão das pendências

Trabalho sobre o código atual: mantenho a identidade laranja/grafite, o cabeçalho claro, a foto de abertura e a composição 5 destaques + bairros + 15 adicionais. Nada é publicado; a entrega fica na prévia.

## O que conferi no código antes do plano
- O tamanho das fotos (`sizes`) tem a precedência errada: quando a página informa um tamanho, o componente acaba usando o tamanho grande.
- A foto só aparece pelo `onLoad`, e o estado volta a "carregando" em um efeito. Ele não verifica `complete`/`naturalWidth`, então uma foto que veio do cache pode ficar escondida.
- O CSS da busca Morar ainda corta os nomes dos filtros (`nowrap` + `ellipsis`).
- "Mais filtros" ainda é um painel dentro do formulário. O projeto já tem `Sheet` e `Drawer` prontos para usar.
- A home só busca a vitrine semanal quando a marca é Cordial (`brand === "cordial"`). Hoje a Morar usa a escolha manual ou o primeiro destaque.

## Frente 1 — Fotos e rótulos
1. Corrigir o cálculo de `sizes` em `PropertyImage` (`const responsiveSizes = sizesOverride ?? (...)`) e revisar os tamanhos informados pela abertura (100vw), pelo mosaico e pela grade compacta.
2. Ciclo de carregamento:
   - Uma referência ao `<img>` reconcilia `complete && naturalWidth > 0` na montagem e quando a foto muda. Isso funciona pela chave da foto (endereço + versão), com um único efeito.
   - `onError` encerra a espera e mostra uma alternativa estável.
   - Os estados "sem foto", "falhou" e "carregando" ficam separados.
3. Para a foto editada da semana: se falhar, tento uma vez a foto original autorizada do mesmo imóvel. Se essa também falhar, a abertura fica em uma superfície neutra e legível.
4. Retirar o observer e a classe `cs-reveal` que não têm mais função, sem esconder nada.
5. Busca da abertura:
   - Os nomes dos filtros passam a quebrar linha (`min-width: 0`, altura mínima para duas linhas).
   - Os valores longos selecionados ficam resumidos, mas o nome acessível continua completo.
   - Revisar o contraste de compra/aluguel, da contagem, do Buscar e do Limpar.
   - Se o vidro atrapalhar a leitura, uso um fundo claro mais sólido.

## Frente 2 — "Mais filtros" em gaveta no celular
- Celular: gaveta de baixo (`Drawer`). Desktop: o painel atual. As duas usam a mesma lógica de filtros, sem cópia de regras.
- Rascunho e filtros aplicados ficam separados:
  - ao abrir, a gaveta copia os filtros aplicados;
  - "Aplicar" confirma e fecha;
  - "Limpar" zera só o rascunho;
  - fechar pelo X, por Escape ou por gesto descarta as mudanças.
- A contagem de resultados do rascunho é protegida contra respostas antigas (por número de pedido).
- Acessibilidade:
  - a gaveta tem título, X visível e foco preso dentro dela;
  - ao fechar, o foco volta ao botão que a abriu;
  - os botões são `type="button"` e não há formulário dentro de formulário no portal.
- Layout no celular:
  - o miolo rola sozinho e o rodapé com as ações fica fixo (`dvh` com alternativa e área segura);
  - o fundo fica travado e a posição da página é restaurada ao fechar.
- Na mudança de tamanho de tela, uma só interface fica montada e os filtros aplicados se mantêm.

## Frente 3 — Vitrine semanal própria da Morar
Mesmas regras puras de `showcase.ts`, com um adaptador por marca. Os dados, o armazenamento e as funções da Morar ficam separados, então a Cordial não é tocada.
- Migração aditiva:
  - tabelas `morar_site_showcase_settings`, `_weeks` e `_attempts`, com GRANTs, RLS e a política restritiva `meta_reviewer_block`;
  - índice único parcial para garantir no banco uma única semana ativa;
  - RPCs Morar de leitura ativa, trava, ativação atômica (valida o candidato e troca a semana ativa na mesma transação) e reivindicação de tentativa (chave de idempotência por marca/semana/imóvel/versão, lease e estado `incerto` sem reenvio).
- Bucket privado `morar-showcase`.
- Servidor (`showcase.server.ts` passa a ser parametrizado por marca):
  - o candidato é escolhido entre imóveis publicados e disponíveis no canal Morar, com foto aprovada;
  - os IDs públicos e a mídia vêm da própria Morar;
  - a geração usa o provedor de edição já configurado, nunca durante a visita, e falha não derruba a semana ativa.
- Agendamento: cron por hora autenticado com `internal_worker_headers()`. Ele ativa o que estiver vencido (segunda 06h, America/Sao_Paulo), inclusive em execução atrasada. Sem edição aprovada, usa a foto original do mesmo imóvel.
- Home: `loadShowcase(brand)` em `home-loader.ts`, com um endpoint de mídia Morar que entrega só a edição aprovada e revalida a retirada do imóvel.
- Administração: nova aba "Vitrine semanal" em `/site-morar-administracao`, no padrão da Cordial:
  - mostra a semana ativa, a escolha manual separada da campanha ativa, original e edição, o estado da geração, o ponto focal desktop/celular, a próxima execução e o histórico;
  - ações: escolher imóvel, preparar a próxima semana, aprovar, reprovar, ativar, pausar e pedir nova edição.
  - O servidor revalida permissão, marca e estado.
- Consumo: registro o consumo real informado pelo provedor, quando houver. Faço um único teste real controlado (cerca de 0,8 crédito) só depois que os testes com provedor simulado passarem.

## Frente 4 — Marcas nas fotos, validação e medições
- Auditar as capas e a foto de abertura da Morar quanto a marca duplicada ou do canal errado. Os originais e as marcas autorizadas são preservados; não apago marcas nem coloco uma segunda logo. O que eu encontrar fica relatado.
- Testes novos: atributo `sizes` literal, foto já concluída, rascunho e aplicação dos filtros, isolamento de marca na vitrine, ativação idempotente/única e cron atrasado.
- Conferência no navegador:
  - nas telas 1280×720, 1366×768, 1440×900, tablet vertical e horizontal, 390×844 e 360×800;
  - entrada direta, cache frio e quente, voltar do detalhe, teclado na gaveta e movimento reduzido;
  - Cordial sem regressão.
- Medições antes e depois nas mesmas condições: LCP, CLS, tempo da primeira foto, bytes e número de imagens. O ponto de partida é chamado "prévia no início da conclusão". INP fica como limitação (exige uso real).
- Entrega: lista curta do que foi corrigido, testado e medido, com capturas e o que ficou bloqueado, se houver.

## Pontos que exigem sua autorização durante a execução
- O teste real de uma edição com IA (cerca de 0,8 crédito).
- A publicação, que continua separada.
