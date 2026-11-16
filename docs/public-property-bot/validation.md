# Validação do Cordial Bot e Morar Bot

Registro em 16/11/2026, sobre a branch `codex/public-property-bots`, derivada de `3a9c4be70a6b2b9fec1509d0e94ac78f710f6af5`. A implementação não está declarada concluída: os testes descritos abaixo não substituem a implantação e o percurso público real. [Arquitetura](architecture.md), [operação/rollback](operations.md) e [mascotes](mascots.md) detalham as decisões relacionadas.

A base da PR foi atualizada para `761a2cf468ecb31f076def4e6c1441e97db1d9cb`, cuja única alteração é o tipo gerado da nova função pública. Nenhuma mudança concorrente de comportamento foi encontrada.

## Estado das mudanças de banco

Todas as aplicações e consultas ao banco desta entrega passam pelo conector Lovable vinculado ao projeto Gestão Cordial `feb646c9-c19a-4360-8cc9-bec5237532ea`. A base compartilhada foi autorizada pelo solicitante. Fixtures são sintéticas identificadas e não representam imóveis comerciais.

| Item                                        | Evidência registrada                                                                                                                   | Limite da evidência                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `0095_public_property_bots`                 | Aplicada pelo conector; journal `created_at=1794800560042`; SHA-256 `6c43d1f35484ff9d8dc568513b627310e9a4cd325e4fef2fa00c2ccf6d5e4972` | Não prova implantação das novas rotas.                                               |
| Projeção pública                            | 499 anúncios Cordial e 353 Morar no momento da consulta                                                                                | Contagens são uma fotografia e podem mudar com publicações/retiradas.                |
| `0096_public_bot_evidence_and_revalidation` | Aplicada pelo conector; journal `created_at=1794803578773`; SHA-256 `74bd466099186c951451cd9f6e39163b3e62db69adc433cbc13e52c962784c34` | Aplicação não substitui os ensaios complementares registrados abaixo.                |
| `0097_public_bot_restricted_gateway`        | Aplicada pelo conector; journal `created_at=1794803986071`; SHA-256 `fb257f317db777cb5040f723b31d7476c7b5acb18648f76a3342b72f8269d5c4` | Os 14 despachos foram ensaiados antes e após a aplicação, com rollback das fixtures. |

Não editar uma migração já aplicada. As correções posteriores entram em nova migração gerada pelo mecanismo existente. Nenhum segredo, token, IP bruto ou conteúdo privado está incluído neste documento.

## Testes automatizados locais

Resultados efetivamente registrados até esta revisão:

| Comando/camada               | Resultado                                            | O que verifica                                                                                                          |
| ---------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run test:site`          | 200 testes passaram no baseline e após as alterações | Busca comum, contratos públicos, marca, arquivo/publicação e helpers dos sites.                                         |
| `npm run test:morar`         | 35 testes passaram                                   | Regressão da busca e apresentação Morar.                                                                                |
| `npm run test:assistant`     | 173 testes passaram                                  | Regressão do assistente interno; o bot público não reutiliza seu backend.                                               |
| `npm run test:public-bot`    | 92 testes passaram na execução final                 | Filtros, estado, evidência, privacidade, fronteira HTTP, sessão, cota, provedor, áudio e transporte do gateway fechado. |
| `npm run test:public-bot:ui` | 38 testes passaram                                   | Formulários, estados, foco/Escape, cota, recuperação, transporte SSE, consentimento, links e gravação cliente.          |
| `npm run typecheck`          | Passou; repetido após os últimos ajustes de UI       | Contratos e tipos do projeto.                                                                                           |
| `npm run build`              | Passou após os cartões de quantidade                 | Compilação de navegador e servidor; avisos preexistentes de chunks grandes e depreciação inputValidator.                |

Nenhuma suíte local registrada apresentou teste reprovado. A CI executa as duas suítes novas junto aos checks existentes. A revisão final corrigiu três falhas de interrupção: callback de gravação antiga não pode parar a nova; reabertura aguarda revalidação antes de mostrar cards; falha de chunk fica isolada ao bot ou à voz sem substituir o site. Os casos têm testes de regressão.

Os 38 testes de interface verificam, entre outros pontos: uma confirmação para quartos/banheiros com seletores de 1 a 10, navegação por setas e preservação dos operadores herdados até uma nova escolha; “Sem preferência” sem zero; orçamento de aluguel separado; piso exclusivo; edição de contagem preservando operador; perguntas obsoletas sem envio; 25º resultado visível; esgotamento/restauração vindos do servidor; recuperação com o mesmo requestId após fechar/reabrir; resposta tardia ignorada; SSE fragmentado e filtragem de sequências; rejeição de destinos externos, outra marca e traversal; e preservação do scroll enquanto a pessoa lê acima. Nova resposta começa no primeiro resultado, sem pular para o último card.

Eventos são testados com consentimento negado/ausente/concedido, falha de rede não bloqueante, lista permitida de campos e deduplicação. Associação entre sugestão e clique fica apenas em memória: reabrir o mesmo componente a conserva, mas histórico reidratado em um cliente novo não inventa atribuição. Não se envia texto, áudio ou ID de imóvel nos eventos.

A camada de voz cliente usa doubles de MediaRecorder/getUserMedia nos testes: cobre seleção de MIME, permissão em contexto, recusa, cancelamento, liberação de tracks, fechamento enquanto a permissão está pendente e descarte de transcrição tardia. Isso verifica o código; não certifica codecs e permissão em aparelhos reais. A revisão do texto precede qualquer envio de chat.

## Integração real com banco pelo conector

O roteiro [database.integration.sql](../../tests/public-property-bot/database.integration.sql) foi executado dentro de `BEGIN … ROLLBACK`. As fixtures substituem a fonte apenas na transação do ensaio e não escrevem em imóveis/publicações comerciais nem acionam provedor de IA. O rollback e a verificação de limpeza fazem parte do ensaio.

Resultados registrados:

- O papel `public_bot_runtime` consultou projeções reais e não teve leitura de `properties`, `clients`, fonte privilegiada ou funções privadas por `anon`/`authenticated`. A projeção não continha campos proibidos de endereço/responsável/proprietário/CPF/comissão/nota interna.
- Sentinelas sintéticas de proprietário, CPF, comissão e nota interna não apareceram no resultado público. A separação Cordial/Morar foi respeitada.
- Com 20 anúncios sintéticos, o único resultado elegível era o 18º e foi encontrado. A busca combinou exatamente dois quartos e pelo menos dois banheiros.
- Mudança da versão pública e retirada durante a revalidação omitiram o anúncio anterior.
- O 25º turno foi aceito e persistido; o 26º na outra marca foi recusado. Replay não duplicou débito ou reserva paga e a sessão de uma marca não abriu na outra.
- A reserva/conclusão de transcrição não debitou turno de chat; tentativa duplicada não liberou custo adicional.
- O janitor removeu sessão, cota e uso técnico vencidos no ensaio, seguido de rollback.

Além da transação sequencial, duas chamadas concorrentes, uma Cordial e outra Morar, disputaram uma cota sintética em 24: houve exatamente uma aceitação e uma resposta de esgotamento. A verificação posterior encontrou zero fixtures remanescentes. Nenhuma franquia de visitante real foi usada para esse ensaio.

A matriz complementar [database.evidence.sql](../../tests/public-property-bot/database.evidence.sql) passou pelo conector em `BEGIN … ROLLBACK`: 13 casos de negação/evidência/escopo de características; cota esgotada ao reabrir e trocar de marca; chave do novo dia sem esgotamento herdado; e conclusão de transcrição após lease expirado sem contar sucesso, com liberação da reserva.

Os casos de [database.suggestions.sql](../../tests/public-property-bot/database.suggestions.sql) também passaram pelo conector em transação com rollback. Verificaram quatro sugestões estáveis e pesquisáveis no catálogo sintético da janela; isolamento de marca e formatação BRL; consentimento negado sem persistir contribuição; deduplicação por evento e por sessão/hora; nenhuma promoção com quatro sessões e promoção após cinco sessões distintas; independência do fuso SQL ao mudar para `Asia/Kolkata`; reconstrução da janela horária; retirada invalidando cache; e catálogo vazio sem sugestões inventadas. Trinta documentos obsoletos anteriores não esconderam o primeiro resultado válido, de referência sintética 31.

O roteiro [database.gateway.sql](../../tests/public-property-bot/database.gateway.sql) passou antes e depois da aplicação 0097 em transação com rollback. Exercitou os 14 despachos, replay, cota, voz e eventos; negou credencial ausente, inválida, expirada e revogada, argumentos extras e operações arbitrárias. SQL literal permaneceu inerte. A verificação posterior confirmou runtime sem acesso ao schema public/tabelas privadas, authenticated sem EXECUTE no gateway, service_role sem leitura da hash, 852 documentos e nenhuma fixture remanescente. [Revisão do banco](evidence/database-review.md).

## Catálogo, desempenho e provedores

`EXPLAIN ANALYZE` de `public_bot.candidates`, para Casa/venda com teto de R$ 650 mil no catálogo disponível, registrou **318,419 ms**. Foi uma única amostra no ambiente compartilhado, com 499 anúncios Cordial/353 Morar observados. Não houve estudo controlado de cache, concorrência ou carga; o número não é p95 e não mede resposta completa da interface/IA. As metas de consulta próxima de 500 ms e resposta útil até 5 s continuam metas a medir.

O Lovable confirmou configuração de `PUBLIC_BOT_DATABASE_REST_URL`, `PUBLIC_BOT_GATEWAY_KEY`, `PUBLIC_BOT_IP_SECRET` e presença de `LOVABLE_API_KEY`. Houve uma chamada de IA com HTTP 200 e uma chamada de transcrição com HTTP 200 usando tom sem fala. Isso comprova conectividade básica do provedor naquele instante; não valida acurácia de um pedido imobiliário completo ou transcrição de fala humana em celular. Não foram repetidas chamadas pagas para simular uma experiência funcionando.

O solicitante salvou o segredo opaco pelo formulário protegido. O Lovable confirmou sua presença no servidor e executou a operação fechada `configuration` por HTTP: Cordial 200 e Morar 200, ambas enabled=true, voice=true, trends=false; chamada sem `X-Public-Bot-Key` 401/PT401. Nenhum valor secreto foi exibido e nenhuma chamada paga foi feita nesse ensaio. Isso valida o transporte do gateway, mas não comprova cota/IP no percurso público. O diagnóstico de headers forjados ainda não comprova o endereço recebido no runtime final dos dois domínios. Enquanto faltar essa comprovação, a API deve responder indisponibilidade e manter busca comum/contato.

Uma inspeção posterior pelo Lovable confirmou ausência dos dois headers de IP confiável do limitador legado; os segredos de rate limit existem. Por isso esse handler usa bucket compartilhado e não consegue provar o IP do bot. Nenhuma configuração foi alterada nessa inspeção. Também foi identificado que os caminhos de API em www/Gestão/preview precisam de prova equivalente de ingresso ou restrição explícita de host antes da atestação global.

### Ensaio de servidor com catálogo e IA reais

O script manual `runtime-smoke.ts` passou pelo Lovable em uma pasta temporária, usando o commit `2f7dcd595507e209c2c4315bee1672cc346978f3`, cujo conteúdo foi conferido por tree hash. Foram exatamente duas extrações reais de IA com reserva de custo, sem retry pago; sessões e endereço TEST-NET eram fixtures, e o catálogo era o público real. O script não altera a configuração persistente nem publica código.

| Marca   | Cards revalidados | Sugestões | Ensaio completo | Provedor | Tokens entrada/saída |
| ------- | ----------------- | --------- | --------------- | -------- | -------------------- |
| Cordial | 5                 | 4         | 5.560 ms        | 1.061 ms | 2.299 / 102          |
| Morar   | 1                 | 4         | 5.926 ms        | 1.060 ms | 2.098 / 104          |

Persistência, SSE, isolamento de sessão por marca e links centrais foram validados. O tempo do ensaio inclui abertura, facetas, busca, persistência e verificações extras; é uma amostra por marca, não p95 nem latência do percurso HTTP público. A verificação não atesta o IP de produção. [Evidência sanitizada](evidence/runtime-smoke.json).

Sessões, turnos, cotas, limite de abertura e uso técnico sintéticos foram removidos pelo conector; nova leitura confirmou zero resíduos e 852 documentos. As duas chamadas pagas e sua reserva global foram preservadas no controle de custo. Não houve gravação de anúncio, lead ou atendimento.

### Execução da CI

A primeira execução da PR passou instalação, tipos e Morar, mas sofreu crash nativo do Node/V8 em `bot-config.database.test.ts` do assistente interno (`jit_page_->allocations_.erase(addr) == 1`, stack WASM). Esse teste e suas dependências não foram alterados pela feature; a suíte local do assistente havia passado. Não foi uma asserção funcional do bot público. A segunda tentativa do mesmo commit passou todas as etapas, inclusive servidor/UI dos bots e build ([execução](https://github.com/leomateus620-pixel/gestao-cordial-morar/actions/runs/43808169783)). A assinatura é compatível com o [bug conhecido do Node/V8](https://github.com/nodejs/node/issues/66366); o teste permaneceu intacto e não foi desabilitado.

## Inspeção visual e acessibilidade

As capturas usam a prévia local explicitamente identificada como sintética, que reutiliza os componentes de produção. Fotos, valores e anúncios dessa prévia são fixtures; não são apresentados como catálogo real.

| Captura                                                                          | Cenário observado                                                                                                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Cordial 360 px, três cards](evidence/cordial-360-3.png)                         | Cabeçalho/painel e lista de resultados em largura pequena.                                                                        |
| [Morar 360 px, orçamento](evidence/morar-360-budget.png)                         | Formulário com opções de orçamento e identidade Morar.                                                                            |
| [Morar 390 px, início](evidence/morar-390-welcome.png)                           | Boas-vindas, sugestões e compositor.                                                                                              |
| [Morar tablet 768 px](evidence/morar-tablet-budget.png)                          | Ajuste do painel e formulário ao espaço intermediário.                                                                            |
| [Morar com altura reduzida](evidence/morar-short-viewport.png)                   | Viewport 390 × 420; simula menor área disponível, não teclado físico aberto.                                                      |
| [Cordial 390 px, um card](evidence/cordial-390-1.png)                            | Viewport 390 × 844; uma opção, seus CTAs e compositor.                                                                            |
| [Morar desktop expandido, cinco cards](evidence/morar-desktop-5-expanded.png)    | Viewport 1440 × 1000; captura do fim de um histórico com cinco opções, mostrando o quinto card e o WhatsApp independente do site. |
| [Morar desktop, início da grade](evidence/morar-desktop-5-grid.png)              | Viewport 1440 × 1000; primeira linha com dois cards lado a lado no painel expandido.                                              |
| [Cordial tablet, um card](evidence/cordial-tablet-1.png)                         | Viewport 768 × 1024; card, compositor e contato em espaço intermediário.                                                          |
| [Cordial 390 px, quantidades](evidence/cordial-390-counts.png)                   | Seleção independente de quartos e banheiros em cartões.                                                                           |
| [Morar 360 px, cabeçalho](evidence/morar-360-header.png)                         | Logo, bot, favoritos e menu preservados; largura do documento igual ao viewport (360 px), controles de 44 px ou mais.             |
| [Morar 360 px, quantidades](evidence/morar-360-counts.png)                       | Cartões numerados e uma confirmação, com toque mínimo de 44 px.                                                                   |
| [Morar desktop, quantidades](evidence/morar-desktop-counts.png)                  | Formulário compacto no painel lateral.                                                                                            |
| [Par de mascotes](evidence/mascots.png), [detalhes](evidence/mascots-detail.png) | SVGs próprios em 24/32/40/64 px e estados; teste de reduced motion confirmou `animation-name: none`.                              |

A pergunta de quartos/banheiros usa dois grupos de rádios, cada um com cartões de 1 a 10 e “Sem preferência”, sem dropdown de operador. Novas escolhas representam a quantidade exata; filtros anteriores como “3+ quartos” são preservados se o grupo não for alterado. Selecionar não envia: um único “Continuar” confirma ambos. A inspeção mediu cartões de 52 px de altura e larguras mínimas de 55,59 px em 360 px; “Sem preferência” tem 44 px de altura.

Foco inicial, Escape, seletores e bloqueio de interações obsoletas têm testes de DOM; isso não equivale a sessão com leitor de tela real. Não foi comprovado zoom nativo de 200%, teclado físico em Safari/iPhone/Chrome/Android nem contraste instrumental de todos os estados.

Creative Production foi solicitado e a documentação lida, mas a ferramenta de board necessária não ficou disponível. Os SVGs personalizados locais são provisórios e verificados visualmente; não são declarados como produção/aprovação pelo Creative Production. Não há vídeo, canvas ou biblioteca pesada para o avatar. Detalhes e brief estão em [mascots.md](mascots.md).

## Pendências para aceite final

1. Comprovar sobrescrita e origem confiável do IP no runtime de ambos os domínios, incluindo bloqueio de hostname alternativo. Só então atestar o ingresso.
2. Implantar o código da PR e executar o percurso público real das duas marcas: sessão, seleção, texto, resultado atual, refinamento, revalidação de retirada e WhatsApp central.
3. Transcrever fala real, revisar e enviar nos navegadores/dispositivos alvo; conferir recusa, silêncio, cancelamento e indisponibilidade. Completar leitor de tela, zoom nativo e teclado virtual real.
4. Completar capturas restantes e medição de carga delimitada antes de afirmar cumprimento das metas.

Não há pedido de nova aprovação de ativação: a implantação está autorizada. Essas pendências são dependências técnicas e evidências ausentes. Até resolvê-las, a entrega não satisfaz integralmente a definição final de pronto.
