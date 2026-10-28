# Marketing — implementação e validação de UX

Preparado em 28/10/2026. Evidências locais são de uma prévia isolada identificada como **dados sintéticos**, sem chamadas reais à Meta/CRM. Não comprovam operação de produção nem revisão da Meta.

## Limite da observação inicial

A tentativa de acesso a `/marketing` em produção redirecionou para `/login`; não havia sessão autorizada. Não foi possível auditar visualmente o fluxo autenticado anterior. Os problemas de baseline abaixo vieram do código, não de observação de usuários:

- Área aberta em estado local; recarregar perdia a área e o contexto de Leads.
- Pesquisa de campanhas disparava mudança de consulta a cada tecla.
- Desmontar qualquer consumidor de `useAds` apagava todas as consultas de Marketing do usuário, prejudicando retorno com cache.
- Cadastro manual e sincronização apareciam para o perfil revisor; não havia jornada própria de anúncio.
- Quatro KPIs prioritários dividiam a primeira dobra com indicadores adicionais sempre expandidos.

## Observação posterior com sessão de produção

Com uma sessão autorizada disponibilizada posteriormente, foi observada a interface anterior em produção, ainda com três áreas e onze KPIs. Uma entrada em `/marketing` sem query redirecionou para `competence=1969-12`. As capturas reais que contêm informações financeiras ficam fora do repositório; as evidências versionadas da interface continuam identificadas como sintéticas.

A reprodução automatizada carregou o módulo de validação com relógio no epoch e validou a URL com relógio em outubro de 2026: o fallback calculado na inicialização devolveu `1969-12`. A correção calcula o mês corrente durante cada validação, preservando o mês explicitamente informado. O mesmo módulo passa a devolver outubro e depois novembro quando o relógio avança. Isso reproduz a causa possível do redirecionamento observado sem afirmar inspeção do relógio interno de produção ou implantação da correção.

## Comportamento implementado

A URL preserva área, imobiliária, conta, plataforma, mês/intervalo, busca, status, página e ordenação local da página. A rota calcula uma única vez o recorte de datas e o passa ao dashboard; consulta, comparação, detalhe e PDF usam esse mesmo objeto de recorte. O calendário padrão do seletor é America/Sao_Paulo; ele não é reinterpretado pelo fuso de contas presentes em uma página parcial. Os fusos das contas continuam metadados das métricas. No cadastro manual, o contexto “Todas” exige escolha explícita de uma imobiliária autorizada; a marca aparece no formulário e não há fallback para Cordial. Leads preserva busca, formulário, campanha, responsável, situação e página. Trocar de área mantém o contexto; alterar escopo reinicia apenas a paginação afetada. Ordenação é rotulada como restrita à página, não apresentada como ranking global.

Campanhas abre o detalhe em painel mantendo a lista montada. O fechamento restaura foco ao acionador sem rolar a lista. O assistente tem cinco etapas, salvamento parcial confirmado pelo servidor, revisão explícita e criação pausada. Há identificação de alterações locais e erro de salvamento; fechamento com alterações tenta persistir antes de sair. Gestão externa mostra IDs, estado configurado/efetivo e exige confirmação contextual de ativação/orçamento, com leituras anteriores/posteriores no backend. Uma campanha criada pode ser vinculada à mensuração pela ação que reutiliza a importação existente.

Visão geral mostra quatro KPIs prioritários, tendência, resumo acionável e métricas secundárias sob expansão. Ausência de dado aparece como indisponível; comparações sem base não geram porcentagens. A tendência declara quando cobre só a página. Dados financeiros dependem do DTO autorizado. Nenhuma etapa exige dados pessoais no relatório executivo.

Leads diferencia perfil sem acesso, falha, filtro vazio e ausência de recebimento. Oferece pesquisa autorizada, filtros, atribuição, detalhe com origem/perguntas/histórico, configuração de formulários reutilizada, saúde e recuperação em fila. Relatórios reutiliza o escopo da URL, permite prévia, geração e histórico privado. A geração recebe novo snapshot coerente; uma prévia anterior não é descrita como o mesmo instante da geração.

Todas as consultas usam chaves com usuário/perfil/escopo; dados anteriores só permanecem durante atualização compatível na mesma imobiliária/conta, com aviso. Ao mudar identidade ou perfil o cache anterior é removido. Pesquisas possuem debounce de 350 ms. As áreas Leads, Relatórios e assistente são carregadas sob demanda. A interface chama server functions; não transporta credenciais nem chama Graph diretamente.

## Verificações de tarefa observadas no navegador

O registro abaixo vem da execução manual assistida em uma prévia estática servida em `127.0.0.1:5180`, construída a partir do código para evitar interferência de HMR. Não é uma suíte automatizada nem pesquisa com participantes. Todos os registros, permissões, respostas e relatórios dessa prévia são fixtures explicitamente identificadas como sintéticas; nenhuma operação foi enviada à Meta ou ao CRM real.

| Tarefa | Observação | Ativações registradas | Limite |
|---|---|---|---|
| Alternar entre as quatro áreas | Área e contexto preservados | 1 | Prévia sintética |
| Abrir campanha visível | Painel de detalhe aberto pelo nome | 1 | Prévia sintética |
| Buscar e abrir campanha | Foco na busca, digitação de `Captação`, abertura do resultado | 2 + digitação | Contagem de requisições do debounce ainda não medida |
| Retornar do detalhe | Fechar preservou a busca exata `Captação` e restaurou o foco; após a animação, a leitura estabilizada de rolagem foi 14,56 px | 1 | Cenário de retorno observado, não prova de todos os fluxos |
| Distribuir lead | Seleção do corretor e `Distribuir`; status passou para Importado | 2 | Mutação somente da fixture; nome do responsável foi acrescentado depois dessa observação |
| Gerar PDF no escopo selecionado | `Revisar escopo` e `Gerar PDF`; histórico mostrou conclusão | 2 | Fixture de resposta pronta; download e fila durável de alto volume exigem verificação separada |
| Abrir assistente | Acionador direto em Campanhas | Meta estrutural: 1 | Não cronometrado como tarefa completa |
| Diagnóstico | Link contextual Integrações | Meta estrutural: 1 | Destino de produção continua dependente de sessão e autorização |

As capturas `docs/evidence/marketing/overview-{360,390,768,1280,1440}.png` registram as cinco larguras CSS alvo. Em cada largura, a largura medida do conteúdo do documento coincidiu com a largura do viewport, sem rolagem horizontal da página. Isso não comprova, por si só, todos os estados de tabelas, diálogos, teclado virtual, contraste ou acessibilidade. Há capturas adicionais de Campanhas, Leads, Relatórios e assistente no mesmo diretório. Na revisão mobile do assistente a 360 × 900 px, o contêiner interno mediu 900 px de altura e `scrollHeight` de 983 px; a rolagem até aproximadamente 82,7 px tornou as ações inferiores acessíveis, sem overflow horizontal (largura do documento: 360 px). A captura `wizard-review-360.png` registra esse estado no fim da rolagem.

Foi reproduzido um problema no calendário do assistente: a data digitada aparecia no campo, mas não sobrevivia ao salvamento. A correção passou no teste de serialização/fuso e trata `input` e `change`, preservando o valor de edição. A repetição no perfil sintético `role=bianca` passou: orçamento `50,00`, início `2026-11-01T09:00`, revisão 3 confirmada, revisão final correta e valor preservado após fechar/reabrir. O fechamento do assistente revelou inicialmente foco retornando ao documento, diferentemente do detalhe de campanha. Após a correção específica, a repetição passou nos dois acionadores: fechar um novo assistente devolveu o foco ao botão `Criar anúncio na Meta`; salvar, fechar, reabrir e fechar um rascunho devolveu o foco à sua linha acionadora.

## Como reproduzir a QA isolada

Execute a partir da raiz do repositório, com as dependências instaladas e Node disponível no PATH. Para exploração com recarga automática, use `node node_modules/vite/bin/vite.js --config tests/marketing/vite.config.ts`. Para uma execução estável, construa e sirva uma cópia estática:

```sh
node --input-type=module -e 'import { build } from "vite"; await build({ configFile: "tests/marketing/vite.config.ts", build: { outDir: "/tmp/marketing-qa-dist", emptyOutDir: true, rollupOptions: { input: "tests/marketing/preview.html" } } });'
node node_modules/vite/bin/vite.js preview --config tests/marketing/vite.config.ts --outDir /tmp/marketing-qa-dist --host 127.0.0.1 --port 5180 --strictPort
```

Abra `/tests/marketing/preview.html?state=partial&agency=cordial&competence=2026-10`. A faixa superior deve informar **PRÉVIA ISOLADA · Dados sintéticos**. Se não informar, não use essa página para testar os comandos abaixo.

1. Em cada largura 360, 390, 768, 1280 e 1440 px, registre a largura do conteúdo/viewport e capture a Visão geral. Use uma altura que permita testar a rolagem do diálogo, por exemplo 900 px.
2. Vá a Campanhas, foque a busca, digite `Captação`, aguarde o debounce e abra um resultado. Registre foco, busca e rolagem antes de abrir e depois de fechar, aguardando terminar a animação.
3. Em Leads, selecione o corretor sintético e distribua o lead. Confira status, responsável, badge `TESTE SINTÉTICO` e detalhes. No celular, abra os filtros adicionais; pesquise sem presumir que a fixture implementa toda a filtragem do servidor.
4. Em Relatórios, revise o escopo e gere o PDF. Observe o histórico. Com `reportState=queued`, a fixture permanece deliberadamente na fila: deve mostrar solicitação pendente, não sucesso de arquivo gerado, e manter a navegação disponível.
5. Use `role=bianca`, `role=secretaria` e `role=meta_reviewer` em recarregamentos separados. O primeiro representa concessões operacionais sintéticas; os demais não devem ganhar criação/gestão externa por essa concessão. Nenhum desses perfis deve receber finanças gerais pela fixture operacional. O revisor deve ver a recusa de contatos e escrita.
6. No assistente sintético, selecione a conexão, avance até orçamento/calendário, digite `2026-11-01T09:00`, salve, feche e reabra o rascunho. Confira o valor e o estado de salvamento; percorra as cinco etapas pelo teclado e alcance as ações inferiores no celular. A fixture de envio externo recusa o comando propositalmente, sem criar objetos na Meta.

Registre êxito, falha, ativações e digitação separadamente. Não contabilize essas fixtures como chamadas Meta, lead real recebido, capacidade de escrita comprovada, pesquisa de usuários ou resultado de desempenho em produção.

## Verificação automatizada executada

`tests/marketing/navigation.vitest.ts`: **14 testes passaram**, cobrindo persistência entre áreas, reinício seletivo de páginas, rejeição de URL inválida, mês padrão calculado na validação mesmo com módulo inicializado no epoch, intervalos equivalentes, parsing de BRL sem arredondamento binário e conversão de calendário pelo fuso da conta (incluindo horário inexistente), concessões operacionais por imobiliária, ausência de concessão e precedência do perfil revisor.

O TypeScript da interface passou; a verificação completa é registrada na entrega integrada. A interface usa elementos nativos/Radix, nomes acessíveis, foco visível e alvos principais de 44 px. Gráficos removem animação e spinners respeitam `prefers-reduced-motion`. Isso não comprova conformidade integral de acessibilidade.

## Metas que exigem medição adicional

| Meta | Classificação nesta entrega |
|---|---|
| Persistência semântica dos filtros nas transições testadas por unidade | Atingida nos testes automatizados |
| Busca sem uma consulta por tecla | Implementada com debounce; contagem de rede ainda não medida |
| Consultas diretas do navegador à Meta | Nenhuma introduzida; transporte exclusivamente servidor |
| Resposta visual 100 ms / troca com cache 300 ms | Ainda não medida |
| LCP p75 ≤2,5 s / INP p75 ≤200 ms / CLS p75 ≤0,1 | Ainda não medida em uso real |
| Contraste 4,5:1 / 3:1 | Texto/controles ativos corrigidos localmente após cálculo de cores; auditoria visual completa, temas e todos os estados ainda pendentes |
| Responsividade 360/390/768/1280/1440 | Visão geral sem overflow horizontal nas cinco larguras observadas; demais estados e teclado virtual não integralmente verificados |
| 90% de sucesso / redução de 25% de interações | Ainda não medida; sem cinco participantes reais |
| Publicação pausada, fluxo Lead Ads → CRM e comparação Ads Manager | Exigem prova externa autorizada e são tratados separadamente da QA sintética |

A criação e a gestão de anúncios consultam concessões explícitas por ação e imobiliária no servidor. A autorização operacional concedida à secretaria identificada pelo administrador permite ler o orçamento do anúncio, criar rascunho, enviar pausado, alterar orçamento e controlar entrega, conforme cada concessão vigente. Não libera relatórios financeiros gerais ou administração de conexão. A prévia isolada `role=bianca` usa apenas identidade e concessões sintéticas para validar essa distinção; `role=secretaria` continua sem esses controles.

## Contraste calculado a partir do código

Cálculo reproduzível: `node tests/marketing/contrast-audit.mjs`. O script lê os tokens claros de `src/styles.css`, converte OKLCH para sRGB, compõe as opacidades sobre um fundo uniforme e calcula a razão de luminância. O dashboard atual usa `KpiGrid` e `TrendChart` de `MarketingAdsPanels.tsx`; `MarketingKpiCards.tsx` e `MarketingCharts.tsx` permanecem no repositório sem importação atual em `src`, portanto seus problemas são riscos de reuso, não evidência da tela capturada. Ele não mede pixels, desfoque, sombras, estados de foco/hover ou tema escuro; portanto, não certifica conformidade. A superfície `liquid-panel` foi modelada como branco a 64% sobre `background`, conforme o CSS existente.

| Combinação no código | Razão calculada | Avaliação do recorte |
|---|---:|---|
| Texto principal / fundo | 13,80:1 | Acima de 4,5:1 |
| Texto do botão primário / primário | 6,24:1 | Acima de 4,5:1 |
| Texto primário / fundo | 5,54:1 | Acima de 4,5:1 |
| `muted-foreground` / `card` | 5,67:1 | Acima de 4,5:1 |
| `foreground/46`, `/48`, `/54`, `/55` em superfícies claras | 2,81 / 2,97 / 3,52 / 3,63:1 | Abaixo de 4,5:1 nos componentes legados sem uso atual |
| `foreground/58` e `/60` em superfície clara | 3,96 / 4,21:1 | Abaixo de 4,5:1; os usos ativos foram alterados para `/65` após esta medição |
| `foreground/65` e `/70` em superfície clara | 4,92 / 5,78:1 | Acima de 4,5:1 no modelo plano |
| Eixos `#6B7280` / superfície clara | 4,59:1 | Acima de 4,5:1, porém margem pequena |
| Barra de cliques (`#1E647D`, opacidade 18%) / superfície clara | 1,30:1 | Abaixo de 3:1 no componente legado sem uso atual |
| Barra de leads (`#2F9E68`, opacidade 82%) / superfície clara | 2,56:1 | Abaixo de 3:1 no componente legado sem uso atual |
| Token da borda de input / fundo | 1,17:1 | Insuficiente se a borda for a única pista necessária para reconhecer o controle; avaliar forma, preenchimento e foco no navegador |

Correções locais aplicadas após o cálculo: texto ativo abaixo de `/65` passou a `/65` (4,91:1 sobre o `card` atual no modelo plano); eixos de gráficos ativos passaram a 12 px e `muted-foreground`; status passou a 12 px; bordas dos campos nativos passaram a `foreground/55` (acima de 3:1 no modelo plano), e o formulário manual ganhou borda/anel de foco primário sem opacidade reduzida. A linha verde do gráfico atual, em opacidade integral, calcula 3,20:1 sobre o card; o preenchimento suave é redundante à linha. Os arquivos legados sem uso atual e os estilos globais permaneceram intactos. Esses cálculos não substituem a verificação de pixels/foco/estados/tema escuro, e a meta integral de contraste não é declarada atingida.
