# Cordial Bot e Morar Bot — decisão arquitetural

Status em 16/11/2026: as migrações 0095, 0096 e 0097 estão aplicadas pelo conector e seus ensaios passaram. O segredo protegido foi salvo pelo solicitante: HTTP 200 nas duas marcas e 401 sem credencial. O fluxo real ainda depende da comprovação do ingresso IP e da implantação da PR. Evidências e pendências estão em [validation.md](validation.md); configuração, implantação e rollback, em [operations.md](operations.md).

Base inspecionada e `HEAD` desta etapa: `3a9c4be70a6b2b9fec1509d0e94ac78f710f6af5`, checkout inicialmente limpo em `main`; trabalho na branch `codex/public-property-bots`. O conector confirmou o projeto Gestão Cordial `feb646c9-c19a-4360-8cc9-bec5237532ea` e a mesma base. A autorização posterior do solicitante permite a base compartilhada. Alterações de banco continuam exclusivas do conector Lovable, com migrações geradas pelo mecanismo Drizzle do projeto, sem editar manualmente o journal, usar SQL Editor, CLI de banco ou credencial externa.

Antes da PR, a branch incorporou por fast-forward a nova `main` `761a2cf468ecb31f076def4e6c1441e97db1d9cb`. A única diferença foi a assinatura gerada automaticamente de `public_bot_gateway` em `src/integrations/supabase/types.ts`; foi inspecionada e não alterou a arquitetura.

## Compartilhar experiência, separar autoridade

A interface reutiliza `SiteShell`, fontes/tokens, Radix Dialog e os helpers públicos de slug, detalhe, mídia, preço e URL. O launcher no cabeçalho carrega o painel sob demanda; o WhatsApp flutuante existente continua independente. O helper do bot usa somente o contato central do settings da marca. Painel, voz, estado e cards são componentes próprios, sem importar contexto autenticado ou ferramentas do assistente interno.

O adaptador de IA usa transporte HTTP para o gateway fixo do Lovable. Não depende de `chat.server`, `AgentContext`, MCP, memória interna, sessão de funcionário ou client administrativo. O código conversacional não recebe `siteDb`, `supabaseAdmin`, service_role ou uma conexão genérica ao banco. `requireSupabaseAuth` e as permissões do assistente interno permanecem fora desta alteração.

## Gateway fechado e projeção pública

A arquitetura final substitui a proposta de JWT customizado por um segredo opaco de serviço. O servidor chama exclusivamente `public.public_bot_gateway(op, payload)` no endpoint REST configurado do projeto, com uma chave publicável do gateway e `X-Public-Bot-Key`. A chave publicável não concede acesso aos dados do bot: o dispatcher exige uma credencial válida, não revogada e não expirada. O banco armazena somente SHA-256 dessa credencial; o segredo fica exclusivamente na configuração protegida do servidor. Não há Auth Hook global nem exposição do schema `public_bot` ao PostgREST.

O gateway tem `search_path` fixo, nomes estáticos e uma lista fechada de operações: configuração, sessão, facetas, candidatos, revalidação, sugestões, reserva/conclusão de turno, reserva de custo, reserva/conclusão de voz, evento normalizado e uso técnico. Rejeita operação desconhecida, campos excedentes, marca inválida, IDs e tipos incorretos. Não aceita SQL, nome de tabela, função arbitrária, URL ou ferramenta escolhida pelo cliente/modelo. Erros externos não revelam detalhes de infraestrutura.

O dispatcher executa sob `public_bot_runtime`, papel sem login, sem herança, sem bypass de RLS, sem leitura direta das tabelas e sem `USAGE` nos schemas `public`, `auth` ou `storage`. Esse papel pode executar somente as funções fechadas do schema privado. A concessão de execução do dispatcher a `anon` não concede acesso direto às funções privadas e continua condicionada ao segredo. A implementação do gateway e seus ensaios de privilégios foram aplicados e confirmados pelo conector; a operação de configuração também passou por HTTP com a credencial restrita.

`public_bot_owner`, também sem login, é responsável pelas funções de projeção e tem apenas as leituras necessárias às views públicas atuais e às bases exigidas por `security_invoker`. O runtime não herda esse papel. Tabelas novas têm RLS, revogações explícitas e políticas restritivas para `meta_reviewer` e `atendimentos_viewer`. A revogação de `USAGE public` de `PUBLIC` evita que uma concessão aditiva reabra a fronteira; permissões dos consumidores existentes identificados no catálogo de roles são preservadas explicitamente. Essa alteração exige ensaio de privilégios e regressão das APIs existentes.

As definições vigentes de `*_site_eligible` foram inspecionadas pelo conector e incorporam a 0086, além da 0085 citada no pedido. Os documentos públicos originais possuem campos desnecessários ao modelo, como `responsible`; não são enviados inteiros. A projeção física usa uma lista explícita de campos a partir de `*_site_eligible` e `*_site_authorized_media`. O indexador não faz seleção ampla de imóveis seguida de remoção informal. Endereço completo fica ausente nas duas marcas, política mais restrita que a permissão opcional da Morar. Coordenadas, EXIF, notas internas e documentos privados não participam.

## Atualização, busca e resultados

A projeção é derivada do catálogo aprovado, não outra fonte comercial. Gatilhos transacionais em imóveis, publicações e mídia sincronizam versões idempotentes; extraem chaves por `to_jsonb(NEW/OLD)`. Retirada e perda de elegibilidade invalidam a recomendação. O runtime não executa rotinas privilegiadas de projeção.

A consulta parametrizada aplica filtros estruturados ao conjunto público completo, antes de limitar os candidatos. Cada contagem tem seu operador e os limites de preço preservam inclusão/exclusão. Não há embeddings. A ordenação considera compatibilidade, preferências explícitas e desempate estável por ID. Finalidade, marca, publicação, orçamento e bairro obrigatório não são relaxados automaticamente. Uma alternativa precisa ter diferença pequena em preferência flexível e explicação visível.

`resolve` compara o índice com a fonte pública atual. Versão diferente, retirada ou falha elimina o item; a montagem final revalida os candidatos. Turnos guardam IDs públicos e resposta mínima, sem snapshot persistente de cards, preço ou mídia. A abertura da conversa resolve novamente os IDs históricos e informa indisponibilidade quando necessário. Fotos e links são montados no servidor/interface por helpers públicos validados; o modelo não escolhe URL ou destinatário.

Contagens mantêm a semântica publicada: suítes não são somadas a dormitórios ou banheiros. `null` continua desconhecido. Diferenciais têm estado `present`, `absent` ou `unknown`, escopo privativo/condomínio e evidência textual pública conservadora. A lista atual cobre piscina, churrasqueira, sala e cozinha, além dos campos estruturados de mobiliado, estágio, financiamento e permuta. Outros diferenciais exigem extensão explícita do contrato e da extração; não são tratados como confirmados. Negação, proposta de construção e amenidade de condomínio não confirmam uma piscina privativa existente.

Sugestões combinam marca, janela horária e versão do catálogo. Toda combinação é reconsultada antes de ser servida, e não depende de IA na abertura. Tendências usam apenas eventos normalizados consentidos, deduplicados por sessão/período, com contribuição mínima de cinco sessões, consideração de impressões e decaimento. Sem consentimento ou volume suficiente, vale diversidade disponível do catálogo. Nenhum texto de conversa é reaproveitado para treinamento.

## Conversa, IA e voz

`SearchDraft` é canônico no servidor e possui revisão. Texto e cliques convergem para patches estritos; trocar finalidade limpa o orçamento anterior sem novo valor explícito. A IA recebe texto minimizado, estado compacto e facetas limitadas, sem o catálogo inteiro. Há uma chamada de extração com contrato validado e limite de tokens/tempo; fatos e respostas são compostos por templates com os dados revalidados. Não há loop de ferramentas ou streaming de alegações ainda não verificadas. O modelo padrão de interpretação é `google/gemini-3.1-flash-lite`, e o de transcrição é `openai/gpt-transcribe`, via gateway Lovable; configuração detalhada em [operations.md](operations.md).

O servidor valida marca pela rota/host, Origin, método, Content-Type, leitura limitada do corpo, IDs, revisão e ações Zod estritas. Preserva a proteção pública dos sites. O cliente não envia histórico arbitrário, mensagens system ou configuração do provedor. Respostas de sessão/conversa usam `no-store`. Falhas de provedor mantêm refinamento estruturado quando disponível, busca comum e contato; não produzem sucesso simulado.

Áudio é gravação curta → transcrição → rascunho editável → envio explícito. MediaRecorder detecta MIME suportado, pede permissão somente após clique e encerra tracks em cancelamento, fechamento ou desmontagem. O servidor limita bytes durante a leitura, inspeciona container e pacotes com mediabunny e limita duração a 60 segundos/10 MiB. Não persiste áudio. Cancelamento/timeout não envia texto automaticamente. Compatibilidade em dispositivos físicos ainda depende dos testes indicados em [validation.md](validation.md).

## Sessão, cota e retenção

Sessão usa token aleatório de 256 bits, hash persistido e cookie HttpOnly/Secure/SameSite=Strict por marca/origem. IP limita uso e nunca autoriza histórico. Cota global: 25 envios aceitos por IP/dia em `America/Sao_Paulo`, compartilhados entre as marcas; chave diária HMAC do IP normalizado, sem marca e sem persistir IP bruto. Sem ingresso comprovado, segredo HMAC ou armazenamento, não ocorre chamada paga. CGNAT compartilha franquia; mudança de rede pode produzir outra chave. Não há fingerprinting nem promessa de 25 envios por pessoa.

Unicidade sessão/requestId, bloqueio transacional, lease e marcador de chamada paga protegem débito e execução. Após custo iniciado, processo incerto não dispara automaticamente outra chamada paga. O 25º envio recebe a resposta; o próximo é bloqueado com 429/Retry-After. Reabrir consulta o esgotamento corrente no servidor. Há limites de rajada, uma execução ativa por sessão, teto global de carga/custo reservado e orçamento próprio de voz. Transcrever não desconta turno; enviar o texto desconta.

A limpeza é o cron interno `public-property-bot-retention`, a cada 15 minutos, chamando a função fechada `public_bot.cleanup()`. Não é endpoint HTTP, não depende de chave pública e não é executável pelo runtime do bot. Sessões expiram após 24 horas de inatividade com máximo absoluto de sete dias; turnos acompanham a sessão. Cotas permanecem até 48 horas após o dia expirar; uso técnico sem conteúdo, 30 dias; estatística agregada, 90 dias; contribuições, 24 horas; conjuntos de sugestão, janela atual/anterior. Esses são prazos operacionais, não alegação de obrigação legal.

Dados pessoais incidentais são mascarados antes de persistir/encaminhar quando não são necessários à busca. Áudio, conversa, IP e identificadores de sessão não vão a Meta/GTM/analytics. Os únicos eventos comportamentais são normalizados e consentidos; conversas não criam leads ou atendimentos.

## Validação e conclusão

A estratégia combina testes unitários/HTTP/voz, componentes com DOM simulado, integração SQL pelo conector em transação com rollback, concorrência com chaves descartáveis, ensaio de privilégios e inspeção de prévias sintéticas identificadas. Testes reais de catálogo/provedor são registrados separadamente. `EXPLAIN ANALYZE` isolado não prova p95. Prévia responsiva não comprova teclado físico, Safari/iPhone, Chrome/Android ou leitor de tela real.

A feature só pode ser declarada concluída depois de implantar as rotas, comprovar o ingresso dos dois domínios e executar o percurso público real. O segredo do gateway já foi configurado e validado por canal seguro. Não há aprovação de ativação adicional após a implantação autorizada; as flags gerais das marcas nascem habilitadas, mantendo indisponibilidade segura enquanto faltar dependência indispensável.
