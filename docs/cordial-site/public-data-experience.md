# Dados, contatos e mídia da experiência pública — 18/10/2026

Código implementado no repositório existente. Migrações propostas e exercitadas somente em PostgreSQL/PGlite local; não foram aplicadas ao banco remoto. O `.env` disponível não contém credencial `service_role`, portanto a configuração institucional e a operação de armazenamento/triagem em homologação continuam sem comprovação nesta execução.

## Contratos públicos e retirada

`20261018170000_cordial_public_experience.sql` mantém os UUIDs, referências e regras de elegibilidade existentes. A projeção Cordial devolve `address: null` mesmo que o cadastro interno permita endereço; a camada TypeScript repete a restrição antes de serializar HTML/JSON. Descrição e características contendo o logradouro cadastrado são retidas por comparação normalizada e limitada, reutilizando o algoritmo já existente da Morar, com política própria para Cordial. A política Morar permanece independente, inclusive quando o endereço foi autorizado naquele canal.

Esse filtro não reconhece perfeitamente toda informação sensível em texto livre ou fotografia. A revisão editorial continua necessária. O endereço institucional da imobiliária permanece separado do endereço dos imóveis.

| Recurso     | Resposta e limites                                                            | Atualização                                               |
| ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| `count`     | `{total}`, sem montar cards/galerias                                          | Mesma função de filtros usada por `properties`            |
| `facets`    | Facetas do recorte recebido                                                   | Mesma elegibilidade e filtros do catálogo                 |
| `summaries` | `{items, missingIds}`, até 50 UUIDs, ordem solicitada, sem descrição          | Revalida a elegibilidade em toda leitura                  |
| `gallery`   | Até 100 metadados de fotos autorizadas, ordem `position,id`                   | Sem baixar originais nem detalhes completos               |
| `videos`    | Até quatro vídeos efetivamente prontos e aprovados                            | Leitura secundária, fora do detalhe principal             |
| `tours`     | Um panorama explicitamente declarado e aprovado, com proporção 2:1 verificada | Consulta, imagem e renderer somente por ação do visitante |

HTTP/JSON continua `no-store`. O cancelamento recebido pelos loaders/API é propagado ao transporte Supabase, com limite de requisição de 15 segundos. Apresentação grade/lista não altera a função SQL de consulta. A função de filtros é compartilhada por catálogo, contagem e facetas; fotos só são consultadas no filtro quando esse critério existe. A montagem dos documentos e capas ocorre após paginação.

## Responsável e contato

O vínculo existente é `properties.corretor_id`, utilizado pelo formulário e pela conclusão de cadastro. Não se usa proprietário, carteira, nome semelhante ou quem clicou em publicar para resolver o contato público.

Uma nova projeção comercial explícita (`cordial_site_responsibles`) é administrada em **Site público Cordial → Responsáveis públicos**. Somente administração publica nome, função, WhatsApp comercial e URL de foto previamente aprovada; URLs assinadas/credenciais são recusadas. A resolução pública exige consentimento publicado ativo, papel operacional atual e usuário sem bloqueio. Sem pessoa elegível, o servidor usa **Equipe Cordial** com WhatsApp institucional válido. Sem canal real configurado, a projeção é nula. IDs internos e contatos privados não integram a resposta.

Contatos institucionais e política aprovada continuam na função administrativa existente. Nenhum telefone, política ou perfil foi inventado/preenchido remotamente. Formulários continuam persistindo na fila real de leads, com deduplicação e posterior triagem idempotente para atendimento; a mensagem recebida não comprova atendimento criado ou visita agendada. Faltam dados institucionais aprovados e acesso autorizado ao ambiente para validar esse percurso real.

Os destaques próprios usam `settings.featuredPropertyIds`, até nove UUIDs públicos únicos em ordem explícita. O picker administrativo oferece imóveis elegíveis reais; o banco rejeita novos UUIDs internos/inelegíveis. Retirada posterior não troca a escolha por outro imóvel. Uma seleção vazia conserva os destaques já marcados no cadastro. Faixas de valor têm tetos configuráveis e crescentes separados para venda/aluguel; valores personalizados continuam permitidos.

## Derivados privados de imagem

O gateway atual e suas URLs são preservados. O novo bucket `public-site-derivatives` é privado e não concede leitura a usuários anônimos/autenticados. A chave inclui marca, UUID público da mídia, assinatura do original, largura, JPEG, qualidade e versão do transformador (`purejs-v2`). Os codecs disponíveis produzem JPEG real; WebP/AVIF não são anunciados sem suporte.

Cada requisição autoriza a mídia antes de ler o derivado e novamente antes de entregar bytes. Isso vale também para cache quente. A tabela privada registra checksum SHA-256, estado e lease; uma RPC exclusiva de `service_role` impede dois servidores de gerar a mesma chave simultaneamente. Trabalho local em andamento também é deduplicado. Arquivo ausente/corrompido é invalidado e reconstruído; falha de armazenamento não libera um original privado como alternativa.

O worker `/api/public/hooks/site-media-worker` prepara dois derivados por execução, fora da navegação. A fila prioriza a capa completa de destaques, capas de cards e miniaturas, depois demais capas e fotos complementares. O agendamento aditivo só é criado quando `pg_cron` e `internal_worker_headers()` existem. O disparo usa a origem HTTPS já guardada em `imobi_worker_origin` no Vault e `public.internal_worker_headers()`, nunca chave pública. A saúde fica em `public_site_media_worker_health`; nenhum segredo é registrado. O botão administrativo prepara explicitamente **as duas primeiras fotos**, sem afirmar que todo o catálogo está preparado.

Enquanto o estoque não estiver preparado, a primeira leitura de uma chave ausente ainda gera e persiste o derivado; portanto esse primeiro acesso conserva custo de transformação e acrescenta a gravação. É necessário aplicar a migração, confirmar o bucket privado, configurar/validar o cron e preparar as capas antes de avaliar ganho na navegação fria. A cadência inicial limita custo e pode levar horas/dias para todo o acervo; não se declara o estoque preparado.

O navegador continua podendo reutilizar mídia por **até 30 segundos** (`private, max-age=30, must-revalidate`). Nenhum cache público longo foi adicionado. Retirada/revisão bloqueia novas leituras; arquivos já desenhados ou salvos não podem ser revogados. Derivados de versões antigas podem ser limpos posteriormente sem interferir na regra de retirada. A recodificação remove EXIF/GPS e não aplica outra marca-d’água.

## Vídeo e tour

O upload de vídeos já existente no cadastro/etapa de arquivos é reutilizado. `20261018171000_cordial_public_video_pipeline.sql` adiciona um fluxo separado `uploaded → processing → ready/error`, lease de dez minutos, invalidação pela assinatura da origem e revisão pública posterior. Limites iniciais: 150 MiB, três minutos, dimensões até 7680 px; originais MP4/WebM/QuickTime podem entrar na fila. A saída exige MP4 H.264, áudio AAC ou ausente, declaração de remoção de metadados e caminho privado próprio.

As RPCs de claim/finish só são executáveis por `service_role`; só administração solicita preparação e aprova/retira a publicação. Um vídeo pronto continua invisível até revisão. Mudança/retirada da origem ou do imóvel invalida a autorização. O gateway entrega `video/mp4` por streaming com suporte a Range, autoriza antes/depois de abrir o arquivo e mantém o URL assinado do Storage no servidor. Falha no pipeline não bloqueia as fotos ou o conteúdo principal.

**Dependência real do vídeo:** não foi encontrado processador/transcodificador configurado. A fila/contratos e player de conteúdo pronto estão implementados; nenhuma transcodificação, capa automática ou entrega real foi simulada. Um executor precisa consumir `cordial_site_claim_video()`, processar no ambiente apropriado e chamar `cordial_site_finish_video()` com metadados verificados.

`20261018172000_cordial_public_tours.sql` implementa tour como fotografia panorâmica **equiretangular 2:1**. A administração escolhe uma foto já autorizada, declara/revisa o formato e o servidor decodifica o JPEG entregue para confirmar sua proporção. Uma proporção 2:1 isolada não declara panorama automaticamente. A projeção guarda a assinatura da foto; revisão/retirada exige nova aprovação e bloqueia novas leituras. O campo legado `tour_virtual` não é adotado.

O botão 360 só aparece quando há um tour aprovado na projeção canônica (`hasTour`). Sua ação solicita os metadados e carrega o viewer WebGL em um chunk separado, sem dependências 3D adicionais. Arrastar, setas, aproximação e reinício produzem renderização por interação, sem movimento automático ou loop contínuo; a rolagem vertical permanece nativa. Há limite de DPR, liberação dos recursos, fallback para fotografia e respeito a movimento reduzido. O gateway de imagens continua autorizando os bytes. **Falta conteúdo panorâmico real aprovado** para demonstrar o recurso no acervo e validar a qualidade da captura; testes locais de contrato/retirada e limites do viewer não substituem esse aceite editorial ou teste em aparelho físico.

## Medição reproduzível e testes

`scripts/cordial-site/benchmark-media.ts` compara sete repetições intercaladas do transformador anterior, primeiro derivado e derivado quente. A amostra é uma fotografia histórica do conjunto privado de QA local, com aprovação simulada exclusivamente no banco em memória; isso não comprova autorização/publicação atual. O relatório não contém caminhos privados ou identificadores comerciais. Codec/JIT e bytes da origem foram aquecidos; o adaptador de persistência usa disco local, sem Supabase/HTTP/navegador. A máquina estava compartilhada com testes/builds, o que elevou a variância.

| Caminho                                 |   Mediana | p95 amostral |
| --------------------------------------- | --------: | -----------: |
| Antes: recodificação repetida           | 287,79 ms |  1.151,10 ms |
| Depois: derivado ausente + persistência | 484,64 ms |  1.551,59 ms |
| Depois: derivado persistido + checksum  | 156,41 ms |    228,14 ms |

Fonte JPEG 675×900, 164.210 bytes; saída JPEG q80 sem ampliação, 158.998 bytes, **idêntica byte a byte** entre os caminhos. Esse microbenchmark demonstra o custo removido pela reutilização e o custo maior no primeiro preparo. Não mede TTFB/Storage remoto, cache do navegador, LCP, INP, CLS ou p75 de campo. Relatório local: `.local/cordial-site-experience/media-benchmark/report.json`.

Testes adicionados exercitam banco e comportamento, incluindo privacidade Cordial com endereço interno autorizado, equivalência de contagem/facetas/itens, zero/null/sob consulta, responsável/fallback, leases/corrupção, vídeo revisado/alteração da origem, autorização antes/depois de cache quente e limites de Range. As suítes existentes Cordial/Morar continuam exercitando migrações reais e a fixture Morar inclui sincronização e arquivamento anteriores. Nenhum teste local comprova a aplicação remota, RLS/Storage implantados, serviço de vídeo ou entrega de atendimento.

## Cadeia real de sincronização e correção encontrada na auditoria final

`tests/cordial-site/current-sync.test.ts` usa a cadeia atual compartilhada, além da fixture histórica de aprovação explícita que continua em `tests/cordial-site/database.ts`. A execução atual aplica:

1. `supabase/migrations/20260926020000_cordial_owned_site.sql`;
2. `supabase/migrations/20260926053825_7b7296a5-cea0-449a-bf61-d560aabb468d.sql` (reconciliação/triggers Cordial);
3. `supabase/migrations/20261001200544_ece5ff76-f639-4a29-9a44-67e2a4af7f0a.sql`, `20261001200617_4187880b-7814-490d-8478-4fc53f3ea20d.sql` e `20261001200745_54b946aa-6112-4f5a-a756-1f67dddf7493.sql` (arquivamento, intenção confirmada e reativação);
4. a migração **canônica** `drizzle/migrations/0002_morar_owned_site.sql`, incluindo os triggers próprios Morar, em lugar da cópia comentada de SQL que os testes carregavam;
5. as migrações `20261018170000`, `20261018171000`, `20261018172000` desta experiência;
6. `supabase/migrations/20261018173000_cordial_sync_trigger_record_access.sql`.

A migração Cordial histórica tinha um erro real: o `CASE` de extração do ID referenciava `NEW.property_id` mesmo para linhas de `properties`, que só têm `id`. PostgreSQL resolve esses campos antes de escolher o ramo; o bloco de exceção absorvia a falha. Assim, uma edição de descrição não reconciliava o hash aprovado e o imóvel desaparecia da projeção pública. O novo teste reproduziu a falha antes da correção.

A migração aditiva `20261018173000` muda somente essa extração para `to_jsonb(NEW/OLD)` e mantém as decisões existentes de reconciliação, retirada manual, permissões e proteção para não bloquear gravações do Gestão. Nenhuma migração histórica foi editada. A correção foi aplicada apenas em PGlite, nunca no servidor/QA já em execução ou no banco remoto.

Verificação específica após a correção: **42 testes passaram** (`current-sync` 3, publicação Morar 29 e arquivamento 10). Eles cobrem atualização canônica com identidade/referência preservadas, retirada manual que não é revertida, revisão de mídia que invalida a versão antiga mesmo com derivado privado pronto, e tour que não herda aprovação de uma fotografia alterada. Essa verificação específica não repetiu o build, pois só alterou SQL, fixtures e testes. O gate final do aplicativo e suas revisões posteriores estão registrados em `experience-delivery.md`.

## Ativação controlada de GA4

`settings.analyticsManualEventsOnly` é booleano estrito e inicia em `false`. O ID e a política, isoladamente, não carregam o SDK. A administração precisa confirmar que pageviews automáticos, mudanças de histórico, busca e detecção de formulários foram desativados no fluxo Google; depois disso ainda é necessário consentimento do visitante. Essa configuração não foi feita remotamente. Os payloads manuais removem queries/fragmentos e redigem tokens de seleção tanto em `/site/selecao` quanto no host público raiz. Revogação aplica `ga-disable-ID` ao SDK já executado, inclusive por alteração em outra aba.

A [documentação oficial do Google](https://developers.google.com/analytics/devguides/collection/ga4/views?hl=en) informa que Enhanced Measurement pode observar histórico mesmo com `send_page_view:false`; por isso essa opção de código não foi tratada como garantia suficiente de privacidade. A [documentação de controles de privacidade](https://developers.google.com/tag-platform/security/guides/privacy) descreve a desativação do identificador. Nenhuma entrega ao GA4 foi validada sem configuração real.
