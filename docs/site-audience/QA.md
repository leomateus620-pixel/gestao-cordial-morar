# Evidências de QA da audiência

Validação local de 26 e 27 de novembro de 2026, no horário de São Paulo. O catálogo, o login e o armazenamento de formulários do fixture são isolados. O aplicativo usa suas rotas e componentes reais, o endpoint de ingestão e o agregador PostgreSQL da migração `0116_site_audience`. O reproducer inicializa um banco PGlite em memória.

## Resultados observados

| Caminho                                                                 | Resultado                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campanha → página inicial → Comprar → A → B → A → WhatsApp e formulário | Em cada marca, 1 sessão, 5 páginas, 3 fichas, 3 cliques nos cards, 1 clique no menu, 1 no WhatsApp e 1 formulário confirmado. O formulário devolveu 201 e o comprovante foi validado na ingestão.                                                                                                                          |
| Recarga, entrada direta e prévia                                        | Recarga gerou uma ficha sem novo clique ou nova sessão. A segunda aba com entrada direta compartilhou a sessão do navegador. A prévia da Cordial gerou apenas a ação de prévia. A Morar não oferece esse controle.                                                                                                         |
| Duas abas, expiração, recusa e revogação                                | Uma aba manteve a exclusividade da medida ativa. A expiração simulada de 31 minutos abriu outra sessão com o mesmo identificador. A recusa manteve a identidade ausente. A revogação removeu a identidade e interrompeu a observação nas duas abas.                                                                        |
| Isolamento e falha                                                      | A marca oposta não recebeu eventos nas assertivas. Na falha forçada de ingestão, o site continuou navegável e um formulário foi persistido. Entrada sem atribuição apareceu como direta no ensaio.                                                                                                                         |
| Painel autenticado compilado                                            | O administrador recebeu o bloco acima dos indicadores de operação e do Bot. Conferidos desktop e viewport de 390 px. O ensaio de Cordial alimentou 3 visualizações e o imóvel 1001. Origens mostrou `qa / cpc` e `acceptance` com 1 sessão e 1 avanço para imóvel. A Morar apresentou zero observado nesse banco separado. |
| Acesso direto ao relatório                                              | A mesma chamada ao server function forneceu agregados ao administrador. Sem autenticação ou como corretor, a resposta indicou acesso negado sem totais. O bloco também ficou ausente no Painel do corretor.                                                                                                                |
| Banco e recortes                                                        | A suíte testa limites e deduplicação, atribuição controlada e comprovante de formulário. A migração roda em PGlite com isolamento de papéis, viradas de calendário, empates, retorno, histórico retirado, supressão, janela parcial e reversão.                                                                            |

Navegadores cobertos no cenário dos dois sites e na prévia de interface: Chrome desktop, Chromium com perfil móvel Pixel 7 e WebKit com perfil iPhone 13. Os perfis móveis são emulados e incluem toque. Safari em iPhone físico e Chrome em Android físico continuam pendentes. O Painel autenticado foi verificado no navegador da aplicação com fixture local. O Lovable foi inspecionado em leitura e tem um rascunho isolado, separado da validação local.

## Interface e revisão de design

O estudo da Creative Production definiu a composição de KPIs e curva à esquerda com o líder à direita. A revisão com Product Design comparou essa composição ao Painel existente e à prévia renderizada. A implementação usa a tipografia, as bordas e as superfícies do Gestão. Os logotipos vêm da base de código. A foto fictícia fica restrita à prévia de design. A configuração real resolve a capa do catálogo público vigente. Ajustamos a margem do último rótulo da curva, a formatação das datas em português e o espaço do domínio no seletor móvel. As verificações do componente cobriram teclado, tooltips por toque, tabela acessível do gráfico, transição entre marcas, rankings, navegação por períodos e estados de relatório. Entre os pares avaliados, o menor contraste de texto foi 5,41:1 e o menor contraste da curva foi 5,19:1.

| Marca   | Desktop                                     | Celular, tema escuro                      |
| ------- | ------------------------------------------- | ----------------------------------------- |
| Cordial | [Captura 1280 × 720](./cordial-desktop.jpg) | [Captura 390 × 844](./cordial-mobile.jpg) |
| Morar   | [Captura 1280 × 720](./morar-desktop.jpg)   | [Captura 390 × 844](./morar-mobile.jpg)   |

## Como reproduzir

```sh
bun run typecheck
bun run test
bun run test:site
bun run build
```

`test:site` inclui os testes de audiência de navegador simulado, contrato, privacidade e banco. Para ver as telas com dados fictícios, execute `bun run preview:dashboard` e abra `/tests/dashboard/audience-preview.html`. `?brand=morar&theme=dark` abre Morar em modo escuro. A suíte de interface requer uma instalação de Playwright com Chromium e WebKit compatíveis. Execute `node --test tests/dashboard/audience-browser.test.cjs` com a prévia aberta. `AUDIENCE_PLAYWRIGHT_MODULE` permite apontar para uma instalação externa.

Para o fluxo de aplicação, execute `bun tests/site-audience/local-app.ts`. Os hosts são `http://cordial.localhost:5198`, `http://morar.localhost:5198` e `http://localhost:5198`. A opção `--built` compila a mesma aplicação para o adaptador local Node e abre as mesmas três superfícies na porta 5208. O Painel de QA usa `admin@example.test` ou `corretor@example.test` com senha fictícia `audiencia-qa-local`. A conta e a senha pertencem somente ao fixture de loopback. Aguarde a disponibilidade da URL antes de abrir o aplicativo.

```sh
node tests/site-audience/public-browser.cjs desktop android iphone
```

Passe `--built` ao teste para apontar para a porta 5208 quando o aplicativo tiver sido iniciado nesse modo. `SITE_AUDIENCE_PLAYWRIGHT_PACKAGE` permite apontar para uma instalação de Playwright com Chromium e WebKit compatíveis. As métricas de conferência ficam em `http://127.0.0.1:5199/__qa/audience` na variante Vite e na porta 5209 na compilada. Ambiente descartável. Cada execução do fixture inicia uma base vazia.

## Ativação e ordem do Painel

A revisão de ativação coloca os indicadores operacionais na frente da audiência. No Painel autenticado de QA, conferimos a ordem Indicadores → Audiência → Bot em Chrome desktop e WebKit com perfil iPhone 13. As duas marcas exibiram o estado habilitado retornado pelo banco. O perfil corretor seguiu sem o módulo. A prévia funcional também cobre a janela ativa antes do primeiro evento, a pausa com histórico e o período sem cobertura.

O ensaio de consentimento com a política geral da Morar vazia abriu o aviso dedicado antes da decisão e confirmou zero sessões até o aceite. O aceite iniciou uma sessão e uma visualização. A expiração simulada iniciou outro identificador e sessão. A revogação removeu a identidade local. A página de política geral continuou exibindo seu estado anterior. Para reproduzir em loopback:

```sh
bun tests/site-audience/local-app.ts --notice-only
node tests/site-audience/public-browser.cjs --notice-only desktop iphone
```
