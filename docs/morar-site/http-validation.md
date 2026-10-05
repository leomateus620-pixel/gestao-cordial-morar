# Validação HTTP local do site Morar

Execução concluída em 05/10/2026, 02:48–02:50 UTC (04/10, horário de Brasília). O ambiente foi Vite/TanStack Start em `127.0.0.1:5188`, com um adapter PostgREST/Storage de teste em `127.0.0.1:5192`. O adapter executa a migração SQL efetiva em PostgreSQL/WASM (PGlite), sem conectar a um banco remoto.

Os dados usados são a leitura autenticada e restrita do Gestão: metadados dos **308 candidatos** e das **4.623 imagens** associadas. A aprovação de autorização, disponibilidade, conteúdo e mídia ocorreu explicitamente somente no PGlite. Essa execução não publica imóveis em produção nem comprova que uma migração remota foi aplicada. Áreas sem unidade confirmada permaneceram ausentes do contrato em m².

Foram baixados, sem alteração dos arquivos canônicos, **358 arquivos**: a capa na posição zero de todos os 308 imóveis e as galerias completas de cinco imóveis reais. Outros detalhes possuem a quantidade e a ordem completas de metadados; seus arquivos de galeria não baixados respondem com indisponibilidade honesta no ambiente local. Isso não é evidência de decodificação integral de todas as 4.623 imagens.

## Resultados executados

| Verificação                            | Resultado                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paginação pelo API público, 26 páginas | 308 identidades públicas distintas, sem perda ou duplicação; total coerente em todas as páginas                                                                                                               |
| Contrato dos 308 cards                 | Sem IDs canônicos, caminhos do Storage, campos de proprietário, mapas/coordenadas ou campos administrativos; endereço e áreas desconhecidas respeitados                                                       |
| Separação de marcas                    | 308 publicações locais Morar e 3 publicações Cordial explicitamente aprovadas em objetos compartilhados; IDs, referências, contatos e namespaces separados                                                    |
| Acesso cruzado por ID público          | Detalhe de uma marca não acessível na outra; visitante não seleciona o namespace enviando `brand`/`namespace` nos filtros                                                                                     |
| Busca combinada                        | Finalidade, casa para aluguel, cidade, bairro, referência exata, dormitórios exatos, preço e fotos; referência real retorna um resultado; aluguel retorna 33                                                  |
| Casos de busca                         | Nenhum resultado, referência literal `%`, preço sob consulta, filtro vazio, área desconhecida; cinco parâmetros inválidos retornam 400                                                                        |
| SSR e páginas institucionais           | Home, busca, sobre, contato, bairros, notícias, financiamento, correspondente e home Cordial retornam 200 com títulos da marca correta                                                                        |
| Separação administrativa no HTML       | Sem sidebar administrativa ou dados de sessão; recursos `src`/`href` inspecionados sem URLs do fornecedor/site antigo                                                                                         |
| Galerias representativas               | Destaque: 3 imagens; casas para aluguel: 17 e 10; apartamento: 23; terreno: 2. Quantidade, posição, capa e ordem coincidem com o Gestão                                                                       |
| Homologação                            | `X-Robots-Tag: noindex, nofollow`, HTML/JSON `Cache-Control: no-store`, robots bloqueia `/`; sitemap retorna 404 enquanto não indexável                                                                       |
| Objetos e mídias inexistentes          | HTML inexistente retorna 404; IDs/mídias inválidos ou de outra marca não recuperam conteúdo                                                                                                                   |
| Retirada local                         | Um imóvel fora dos cinco representativos passa a HTML 410, detalhe JSON ausente e mídia 404; contagem cai para 307. Restauração exclusivamente local retorna 308                                              |
| Texto com endereço oculto              | Seis descrições importadas contêm o logradouro cadastrado após normalização. São omitidas na projeção pública antes de JSON, SSR/hidratação e SEO, preservando o cadastro original                            |
| Contato e duplicata                    | Primeiro teste: fixture da UI persistiu (Morar 1, Cordial 0) e repetição dentro da janela retornou 201 sem adicionar lead. Uma repetição posterior revelou dependência de tempo no teste; ver correção abaixo |

Os seis textos ficam relacionados apenas no relatório restrito `qa-private-content-review.json`. A comparação literal inicial encontrou quatro; normalização de acentos, caixa e espaços identificou outros dois. A omissão é conservadora: cinco nomes também ocorrem em cidades/bairros autorizados. Esses nomes públicos continuam utilizáveis na navegação e na pesquisa; a descrição original e os diferenciais que contêm o logradouro oculto não são publicados. A correção editorial pode ser feita posteriormente no Gestão, sem alterar o imóvel durante a abertura de uma página.

A busca textual consulta tipo, cidade e bairro públicos. Ela não usa o logradouro ou a descrição interna. O teste considera que a mesma sequência pode corresponder legitimamente a um bairro público e verifica essa distinção; não confunde esse resultado com acesso por endereço interno.

## Correção do teste de duplicata dependente de tempo

A repetição de 05/10/2026 às 03:21:05 UTC falhou ao esperar que a fixture antiga da UI continuasse deduplicada com um novo `requestId`. Ela já estava fora da janela SQL de **dez minutos** para o mesmo fingerprint. O backend criou legitimamente um segundo lead fictício local: Morar 2, Cordial 0. A regra SQL permaneceu intacta, os dois registros locais foram preservados e essa falha não foi tratada como sucesso.

O script corrigido usa o opt-in `QAMORAR_CONTACT_FIXTURE=true`. Ele cria uma mensagem fictícia única por execução exclusivamente no adapter loopback, confirma a persistência, repete o mesmo `requestId` e imediatamente repete o mesmo fingerprint com um novo `requestId`. Após cada passo, exige exatamente **um registro a mais** que a contagem inicial e Cordial 0. A duração precisa permanecer dentro dos dez minutos. Não exige uma contagem inicial fixa nem depende de uma mensagem enviada anteriormente pela UI. Não realiza triagem ou notificações.

Antes de substituir `qa-http-report.json`, o script preserva qualquer relatório anterior com `passed: false` em `qa-http-report.failed-{timestamp}.json`, no mesmo diretório restrito e ignorado por Git. A repetição corrigida foi executada de **03:25:28 a 03:26:15 UTC em 05/10/2026**, com **dez grupos aprovados**. A sequência de três POSTs levou 193 ms: Morar passou de 2 para 3 no primeiro, permaneceu 3 nas duas repetições e Cordial permaneceu 0. O relatório falho anterior foi preservado; nenhuma regra comercial ou dado de produção mudou.

## Condições de desempenho e limites da evidência

Seis leituras do catálogo pelo API Vite, após aquecimento e com a base completa, levaram **332, 344, 330, 329, 329 e 329 ms** na primeira execução. Na repetição final, após os outros checks, foram **705, 624, 630, 847, 742 e 626 ms**. Trata-se de Windows, Node, Vite e PostgreSQL/WASM em loopback, sem limitação artificial de rede/CPU. A variação local não comprova ganho ou regressão de campo. São tempos observados de resposta HTTP local, não LCP/INP/CLS, percentil 75 de campo, teste em aparelho físico ou promessa de tempo em produção.

A SQL Morar filtra e conta o conjunto elegível antes de construir documentos e consultar as mídias dos 12 resultados. O filtro explícito de presença de fotos continua verificando mídias autorizadas. Essa mudança mantém a política, o total e a ordenação determinística; evita materializar galerias de todo o catálogo para cada página. O schema do teste reproduz os índices de imagens e vínculos já existentes no Gestão.

O wrapper `src/server.ts` foi observado em funcionamento no desenvolvimento: headers e 410 foram verificados por HTTP, além dos testes isolados. Mídias usam `private, max-age=30, must-revalidate`; após retirada confirmada, novas requisições recebem 404. Uma cópia já obtida por terceiros não pode ser revogada.

Esta verificação não comprova a fonte computada, teclado, foco, contraste, responsividade, gestos ou interação das galerias: esses itens exigem os testes e capturas de navegador documentados separadamente. A inspeção de recursos do HTML também não equivale a uma auditoria de todas as requisições dinâmicas do navegador. Não houve contato comercial real, triagem em produção, ativação de DNS ou publicação do site remoto.

## Repetição segura

Os scripts ficam em `scripts/morar-site/` e nunca são importados pelo aplicativo. A preparação lê o Gestão com autenticação fornecida somente por variáveis de ambiente. Ela exige `QAMORAR_LOCAL_QA=true`, lê o inventário completo já reconciliado em `.local/morar-site-audit`, verifica se houve mudança e baixa somente caminhos canônicos do bucket privado. Nenhuma credencial deve ser gravada em arquivo.

```powershell
$env:QAMORAR_LOCAL_QA = 'true'
node scripts/morar-site/prepare-local-qa.mjs
node node_modules/tsx/dist/cli.mjs scripts/morar-site/local-qa.ts
```

Execute o Vite em outra sessão, usando URL e chave **exclusivamente de teste** do adapter, além dos segredos de rate limit locais das duas marcas:

```powershell
$env:SUPABASE_URL = 'http://127.0.0.1:5192'
$env:SUPABASE_SERVICE_ROLE_KEY = 'morar-local-test-only'
$env:CORDIAL_SITE_RATE_SECRET = 'local-cordial-only'
$env:MORAR_SITE_RATE_SECRET = 'local-morar-only'
npx bun run dev -- --host 127.0.0.1 --port 5188
```

Em outra sessão:

```powershell
$env:QAMORAR_LOCAL_QA = 'true'
# Opcional: três envios fictícios locais, com incremento total de um lead.
$env:QAMORAR_CONTACT_FIXTURE = 'true'
node scripts/morar-site/verify-local.mjs
```

O script usa exclusivamente os dois endereços loopback fixos e nunca envia formulários para o Gestão remoto. Ele executa uma retirada/restauração em PGlite, com restauração garantida em `finally`. Não altere o modo de falha do adapter durante essa execução. O teste de contato só ocorre com `QAMORAR_CONTACT_FIXTURE=true`; deixe essa variável ausente para verificar apenas as jornadas de leitura e retirada/restauração. Repetições próximas também respeitam o rate limit real de teste: cinco tentativas por minuto. Não apague os leads existentes nem altere a janela de deduplicação para acomodar o teste.

Evidências com metadados privados ficam fora de Git e de `public/`: `qa-preparation-report.json`, `qa-runtime-report.json`, `qa-http-report.json`, `qa-http-report.failed-*.json`, `qa-private-content-review.json` e `qa-publication-map.json`, todos sob `.local/morar-site-audit`. IDs locais persistem no mapa para permitir repetir capturas após reiniciar o harness. Os arquivos preparados, a aprovação simulada e os leads em memória não devem ser usados como seed ou prova de ativação em produção.
