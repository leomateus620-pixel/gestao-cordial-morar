# Banco do acompanhamento interno dos bots

Validação em 16/11/2026 no projeto Gestão Cordial `feb646c9-c19a-4360-8cc9-bec5237532ea`, exclusivamente pelo conector Lovable. Base desta etapa: commit `065bfb1d9c85b9656231f5e0d1c677b0acd645b5`, branch `codex/public-bot-insights`.

## Aplicação confirmada

A migração `0098_public_bot_insights.sql` foi gerada por `drizzle-kit generate --custom`, sem edição manual do journal. Foi ensaiada, aplicada pelo coordenador e novamente testada após a aplicação.

- SHA-256: `f1eecee8700d9b26417e6f90f351ed49a83de4273784e681baaf8367ba4101c2`.
- Journal `created_at`: `1794810273530`; linha de banco `id=122`; 99 entradas no journal após a aplicação. O identificador sequencial da linha não equivale ao índice da migração.
- Início real da coleta: `2026-11-16T06:40:40.69337+00:00` (03:40:40 em São Paulo).
- O catálogo público permaneceu com 852 documentos. A migração não altera a publicação de imóveis nem preenche retrospectivamente histórico de visitantes.

Os ensaios usaram `BEGIN`/`ROLLBACK`. A confirmação posterior encontrou **zero** credenciais, sessões, eventos, conversas e registros de uso sintéticos. Nenhum usuário real, perfil, associação de papel ou registro de autenticação foi alterado para testar permissões.

## O que é medido

O acompanhamento é operacional e interno, conforme a orientação explícita do solicitante. Ele independe do consentimento de marketing; as regras existentes de tendências, Meta/GTM e outros eventos consentidos permanecem separadas e inalteradas.

- **Aberturas:** eventos explícitos de abertura, deduplicados pelo UUID da abertura dentro da sessão. Reabrir o painel pode acrescentar uma abertura; repetir o mesmo request não acrescenta outra.
- **Sessões:** primeira observação da sessão pública pelo acompanhamento. Uma sessão que retorna em outro dia continua sendo a mesma sessão. Não é uma contagem de pessoas nem uma identificação por IP.
- **Conversas:** primeira mensagem aceita naquela sessão. Só abrir o painel não inicia uma conversa.
- **Mensagens:** turnos aceitos pelo controle existente, incluindo cumprimentos, alterações de filtros e pedidos fora de escopo. Retry do mesmo turno não duplica a contagem.
- **WhatsApp:** cliques registrados, incluindo cabeçalho, cards e estados de cota/indisponibilidade. Não significa mensagem enviada, atendimento iniciado ou negócio concluído. Um clique em card exige que seu ID tenha sido apresentado em um turno concluído da própria sessão e marca. Retirada posterior do imóvel não apaga o fato histórico do clique; o registro não faz uma nova recomendação nem guarda preço/foto do anúncio.

Os agregados são por marca e dia de `America/Sao_Paulo`, com janelas de hoje, sete e trinta dias. Dias anteriores ao início da coleta não são histórico observado; `trackingSince` permite informar essa limitação na interface.

O detalhe usa um identificador analítico aleatório, diferente da sessão operacional e incapaz de autenticá-la. Mantém perguntas limitadas a mil caracteres, respostas reduzidas a oitocentos caracteres, máscara adicional de dados pessoais, filtros tipados, estado do turno e IDs públicos. Não copia transcrição bruta completa, áudio, IP, hash de autenticação, token de sessão, prompt do provedor ou credenciais. Localidade, tipo, referência e estágio nos filtros precisam corresponder a valores do catálogo público; os demais campos passam pela validação tipada. A máscara por regras reduz exposição incidental, mas não equivale a anonimização universal de qualquer texto livre.

Detalhes expiram trinta dias após a última atividade; eventos técnicos de deduplicação, em trinta dias; agregados, após noventa dias de calendário local. A retenção usa o cron de limpeza já existente. Uma sessão iniciada há 31 dias com atividade há 25 dias permanece disponível. A linha do tempo devolve os quinhentos eventos mais recentes, ordenados cronologicamente, com `evolutionTotal` e `evolutionTruncated` explícitos.

## Fronteira de acesso confirmada

Há cinco tabelas novas com RLS e as duas políticas restritivas exigidas: `meta_reviewer_block` e `atendimentos_viewer_block`. Não foram criados grants anônimos sobre elas.

O papel `public_bot_runtime` continua sem `USAGE` em `public` ou `auth`, sem leitura direta do acompanhamento, sem execução de RPC administrativa e sem associação ao papel de leitura administrativa. O gateway público conserva os despachos antigos e recebe apenas três escritas fechadas: abertura, pergunta de turno já aceito e clique no WhatsApp. Nenhum despacho dá acesso ao painel.

O papel `public_bot_insights_reader` é `NOLOGIN`/`NOINHERIT`, tem `SELECT` nas tabelas de acompanhamento e não tem `UPDATE`, leitura de `properties` ou `USAGE` em `public`/`auth`. As três RPCs administrativas executam uma verificação fechada do JWT do chamador: administrador obrigatório, com negação dominante para `meta_reviewer` e `atendimentos_viewer`, inclusive em combinação com administrador. A verificação não recebe argumentos e não devolve identidade ou dados de negócio.

A permissão `EXECUTE` das RPCs administrativas pertence a `authenticated`; isso, isoladamente, não autoriza ler dados. O guard do banco verifica o papel antes das consultas. `anon` e o executor público não têm essa permissão; `authenticated` tampouco recebe leitura direta das tabelas.

## Ensaios e correções

O coordenador executou `tests/public-property-bot/database.insights.sql` antes e depois da aplicação, com rollback. Passaram:

- Abertura repetida idempotente e reabertura distinta; isolamento entre marcas.
- Aceite, conclusão e replay do chat existente após a instalação do trigger; contagem única do turno.
- Captura da pergunta apenas depois do aceite, máscara dos sentinelas de nome/CPF/e-mail/telefone/HTML e preservação da primeira gravação no retry.
- Evolução de orçamento de R$ 650 mil para R$ 700 mil; cumprimento sem cards classificado como resposta, não como ausência de imóveis.
- Estados pendente, concluído e interrompido após expiração do lease.
- WhatsApp deduplicado; ID nunca apresentado e card sem ID recusados.
- Leitura administrativa, rejeição de anônimo e de autenticado sem perfil administrador, validação de período/paginação e isolamento do detalhe por marca.
- Bloqueio combinado de administrador com cada perfil restrito, usando helpers temporariamente substituídos dentro de savepoints, revertidos em seguida. Isso testa os guards das novas RPCs sem mudar associações reais de papel; não é um teste de login de usuários desses perfis.
- Retenção e preservação da sessão com atividade recente; 501 eventos devolvendo exatamente 500 e sinalização explícita do corte.
- Executor público sem leitura administrativa e papel de leitura sem acesso às tabelas comerciais.

Dois problemas de privilégio apareceram nos ensaios e foram corrigidos antes da aplicação:

1. `postgres` não herdava a propriedade do gateway mantido por um papel `NOINHERIT`; o `CREATE OR REPLACE` falhou. A migração passa temporariamente para o proprietário correto e revoga `USAGE`/`CREATE` temporários antes de terminar.
2. O grant de `auth` ao novo leitor não era concedível pelo migrador neste ambiente. A leitura administrativa falhou por falta de acesso ao schema. A solução manteve o leitor restrito às métricas e colocou somente a verificação de autorização, sem argumentos e com `search_path` fixo, em uma função de proprietário já autorizado. Não foi concedido `authenticated` ao leitor nem ampliado seu acesso ao schema de autenticação.

A revisão também corrigiu ambiguidade de variável no trigger, alinhou limites de paginação, limitou IDs públicos a cinco e revogou privilégios padrão antes das trocas de proprietário.

`database.insights.verify.sql` confirmou journal/hash, privilégios, RLS e ausência das fixtures após a aplicação. `database.insights.cross-day.sql` também passou pelo conector, com rollback: retorno de sessão iniciada ontem sem duplicar novos inícios hoje, abertura e envio no novo dia, total semanal, continuidade, exclusão de agregados futuros e independência do fuso da conexão. O teste usa metadados sintéticos do dia anterior; não avança o relógio real do servidor.

## Medições observadas

O coordenador executou `EXPLAIN (ANALYZE, BUFFERS)` em transações somente de leitura, com claims locais de um administrador já existente e sem devolver conteúdo de visitantes:

| Consulta                                              | Tempo observado |
| ----------------------------------------------------- | --------------: |
| Resumo de sete dias                                   |        4,135 ms |
| Resumo de trinta dias                                 |        5,005 ms |
| Primeira página da lista, trinta dias, até 25 sessões |        3,603 ms |

Foram amostras pontuais após a implantação, com cache aquecido, sem fixtures de volume e **zero leituras de blocos compartilhados do disco** (`shared reads = 0`). Não houve carga simultânea definida. Os valores não incluem rede, renderização ou autenticação HTTP e não são p95 nem evidência de capacidade para um volume futuro de sessões. Os índices acompanham as consultas por marca/última atividade e por conversa/ordem temporal; não foram adicionadas extensões por expectativa de desempenho.

A idempotência foi exercitada com retries sequenciais. A implementação usa lock da sessão, unicidade de evento por sessão/tipo/UUID e incremento transacional dos agregados, mas este conjunto de evidências **não inclui um ensaio concorrente em conexões distintas** do novo acompanhamento. A concorrência da cota do bot foi testada na entrega anterior e não deve ser apresentada como teste destas novas métricas.

O backend público trata falhas das chamadas de acompanhamento como observáveis e sem interromper a busca; os contadores de aceite e transições do turno são gravados pelo trigger na transação existente. Os testes SQL não substituem a verificação de clique no navegador, da coleta real após deploy do frontend, nem da apresentação do painel autenticado.
