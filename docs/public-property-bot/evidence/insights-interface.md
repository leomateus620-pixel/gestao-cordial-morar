# Validação do painel e mascotes

Execução local em 16/11/2026, Node 22.21.1, macOS. Banco validado separadamente pelo conector Lovable; ver [insights-database.md](insights-database.md).

| Verificação | Resultado |
| --- | --- |
| `npm run test:public-bot` | 104 testes aprovados |
| `npm run test:public-bot:ui` | 41 testes aprovados |
| `npm run test:public-bot-insights:ui` | 23 testes aprovados |
| `npm run test:site` | 200 testes aprovados |
| `npm run test:morar` | 35 testes aprovados |
| `npm run typecheck` | Aprovado |
| `npm run build` | Aprovado; avisos de chunks grandes e diretivas `use client` de dependências permanecem no build |
| `git diff --check` | Aprovado |

Os testes verificam isolamento de marca/ID, usuário administrador, estados de erro/vazio/carregamento/sessão expirada, paginação, períodos Hoje/7/30, gráficos por teclado, filtros da timeline, Escape e retorno de foco. A coleta de abertura foi corrigida durante a revisão: perda da primeira resposta sem cookie e retry não contam acesso antes da confirmação do navegador. Contato e abertura internos não exigem consentimento de marketing; as sugestões existentes continuam exigindo.

A inspeção CUA usou os componentes reais em uma prévia explicitamente sintética. Foram conferidos desktop 1280/1440 px, tablet 768 px, celular 390 px e tema escuro em 360 px. Nenhuma rolagem horizontal foi observada em 360/390 px. O drawer ocupa os 390 px disponíveis; bairro longo quebra sem truncamento. Troca de série e tecla End exibem data/valor; filtros locais da timeline preservam o perfil da procura. Escape devolve foco à sessão. Erro de leitura oferece retry e não apresenta zeros como se fossem dados recebidos.

As duas imagens WebP foram carregadas no navegador, com tamanho intrínseco 192×192. As transformações de busca mudaram entre observações e usam animações diferentes para Cordial e Morar. Em `prefers-reduced-motion: reduce`, a animação computada dos personagens e do drawer foi `none`. As emulações temporárias foram removidas após a verificação. Escalas 24/32/40/64 px e transparência estão registradas em [mascots-raster-scale.png](mascots-raster-scale.png).

Capturas com dados sintéticos:

- [Desktop e dois cards](insights-desktop.png).
- [Detalhe de sessão em 390 px](insights-mobile-session.png).
- [Tema escuro em 360 px](insights-dark-360.png).
- [Sem atividade em tablet](insights-empty-tablet.png).
- [Mascotes no navegador](mascots-browser.png).

Os gráficos não acrescentam biblioteca; alternar série e filtrar eventos não faz chamadas de rede. Cada mascote otimizado pesa menos de 41 KB. As medidas de SQL são amostras pontuais, não uma promessa de latência ponta a ponta. A prévia não prova login nem implantação do novo painel em produção; o código real usa funções autenticadas e o banco aplicado. A conferência com visitas reais e o painel autenticado deve ocorrer após integrar e implantar a PR. Não foram declarados testes de Safari/iPhone, leitor de tela externo ou zoom nativo nesta etapa.
