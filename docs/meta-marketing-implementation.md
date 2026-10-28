# Marketing Meta: implementação e evidências

Data: 28/10/2026. Base verificada: `5db43580ce59bbc2fc986dcee07e335dceae74df` (origin/main e projeto Lovable `feb646c9-c19a-4360-8cc9-bec5237532ea`). Branch: `codex/meta-marketing-three-journeys`. Nenhuma alteração posterior encontrada na abertura. Durante a execução, origin/main avançou para `0b2116b3` com o resultado da consulta Lovable e depois para `75c50fff`/`da34a2bd` com tipos Supabase regenerados. Todas essas alterações foram incorporadas; conflitos de tipos preservaram os novos campos e a nulabilidade necessária. Migrações existentes 0000–0046 preservadas.

## Matriz inicial revalidada

| Função | Implementação/tabelas/RPCs atuais | Graph / escopo | Evidência disponível | Lacuna / conclusão verificável |
|---|---|---|---|---|
| Cadastro interno | CampaignCreateDrawer; marketing_campaigns, marketing_campaigns_safe | Não usa Graph | Código | Tornar rótulo inequívoco e bloquear reviewer em todas as mutações |
| Leitura e métricas | meta.server, ad_sync_jobs, ad_sync_enqueue/claim/commit/fail, marketing_daily_metrics | campaigns, insights / ads_read | 57 campanhas, 73 linhas em 3 campanhas | Cobertura, ausência ≠ zero, análise compartilhada e snapshot PDF; comparação Ads Manager pendente |
| Criação e gestão | Sem comandos externos | campaigns/adsets/adcreatives/ads / ads_management + identidade atribuída | Não comprovada | Rascunho persistido, hierarquia pausada e IDs; incerteza de transporte sem repetir POST |
| Recebimento de leads | Webhook HMAC, meta_lead_ingest/claim/complete, meta_lead_submissions | lead ID, form/leads / leads_retrieval + acesso à Página | 0 mapeamentos, 0 submissões | Mapear formulário explicitamente; receber lead sintético autorizado até atendimento |
| Formulários/recuperação | listMetaLeadForms, saveMetaLeadFormMapping | page/leadgen_forms, form/leads | Backend presente, não comprovado ponta a ponta | UI operacional, checkpoint de recuperação, tombstones preservados |
| Diagnóstico | diagnostics.server + webhook-status.functions | debug_token, subscriptions, subscribed_apps | App publicado; isso não comprova acesso | Transporte único, estados disponível/indisponível/não verificada por evidência |
| Relatórios | Sem registro/arquivo PDF de Marketing | Snapshot local autorizado | Não existente | PDF paginado privado, autorização vigente no download, sem PII |
| Segurança | marketing_can_operate permite reviewer; service_role em leads | Não aplicável | Revisão de código, sem exploração | Reviewer domina papéis combinados; ação/contexto validados servidor e SQL |

## Evidência inicial

- Conector Lovable confirmou nome Gestão Cordial, banco Supabase habilitado e commit acima. Consulta agregada read-only: 57 campanhas Meta, 2 ativas, 73 linhas de métricas em 3 campanhas, zero mapeamentos, zero submissões; journal com 47 entradas até 0046. Não foi feito backfill indiscriminado.
- Navegador interno na abertura: acessar `https://cordialgestao.com/marketing` redirecionou a `/login`. Não havia sessão autorizada naquele momento. A tela autenticada não foi auditada inicialmente; problemas identificados no código eram hipóteses até o ensaio local. A inspeção autenticada posterior está registrada na verificação de entrega.
- Código: aba em estado local; busca sem debounce; 12 KPIs; cadastro interno ambíguo. Ensaios locais devem usar fixtures explicitamente sintéticas e não são prova de operação Meta.
- Meta Developers Insights e recuperação retornaram HTTP 429. Guia primário acessível: https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md . Distingue inscrição do app, inscrição da Página, recuperação e teste ponta a ponta. SDK oficial será usado como referência adicional; disponibilidade efetiva continua dependente da conta.

## Limites de execução

Não ativar anúncios, aumentar orçamento nem criar criativos externos para testar. Não alterar a conexão publicada nem inferir imóvel/corretor/formulário. Aplicação de migrações, deploy, probes reais e testes sintéticos terão registros separados. A ausência de evidência externa impede classificar uma jornada como operacional.

## Modelo e capacidades entregues no código

| Jornada | Implementação | Prova local | Prova externa necessária |
|---|---|---|---|
| Operar anúncios | Rascunho versionado; imagem selecionada; cinco etapas; comandos duráveis; criação pausada; pausa/ativação/orçamento separados; reconciliação de resultado incerto | Contratos Graph simulados, revisão concorrente, leases, deduplicação e autorização SQL | Escrita real não executada; faltam os quatro IDs e confirmação de status na Meta |
| Mensurar | Fonte de campanhas existente preservada; descoberta de hierarquia; jobs Insights por campanha/conjunto/anúncio; grãos diário/período e breakdown explícito; qualidade e revisões | Paginação, janela/fuso, erro não vira zero, famílias de ações, taxas ponderadas e snapshots | Comparação no mesmo recorte com Ads Manager ainda pendente |
| Receber leads | HMAC original, fila/leases, contexto, formulário/mapeamento, caixa de entrada, recuperação com checkpoints e tombstones | Duplicação, conflito, troca de Página, isolamento por imobiliária e teste exato | Resultado do teste autorizado registrado separadamente, sem substituir evidência por fixture |
| Relatar | PDF servidor com logo oficial, resumo, gráfico, tabelas paginadas e metodologia; snapshot imutável; arquivo privado com assinatura curta | Amostras sintéticas inspecionadas; autorização vigente e exportação completa | Download autenticado em produção depende da publicação do código |

Os dados de campanha e métricas existentes continuam a fonte de verdade. `meta_ad_hierarchy` guarda configuração externa e data da leitura; não substitui a campanha manual. `meta_ad_drafts`, `meta_ad_commands` e eventos persistem intenção e cada ID externo. `meta_insight_jobs` e métricas de entidade conservam grão, período, atribuição, moeda, fuso e versão. Relatórios registram snapshot, hash, autor, escopo, arquivo e estado de geração. Leads conservam identidade externa, timestamps distintos e histórico sem duplicar contatos por evento.

### Acesso de Bianca

O cadastro confirmado é Bianca Regina (`b06a522f-65b4-4e2a-8bb4-e9e1f0675b75`), secretária/corretora com vínculo a Cordial e Morar. A migração 0054 concede ações Meta expressas somente nas imobiliárias às quais ela continua vinculada: orçamento operacional, rascunho, envio pausado, alteração de orçamento e pausa/reativação. A política existente da secretária permite acompanhamento e cadastro manual. Não concede administração de conexão, segredos nem relatórios financeiros. O frontend consulta permissões do servidor; não contém uma exceção por nome ou UUID. `meta_reviewer` prevalece sobre todos os papéis e concessões combinados.

### Escopo de produto e limites honestos

- O assistente inicial suporta BR/BRL, Feed Facebook e imagem JPEG/PNG, com destino site ou formulário instantâneo autorizado/mapeado. Vídeo, carrossel, mensagens, outros países/moedas e prévia oficial de posicionamento ficam no Ads Manager. Esses formatos não aparecem como operações implementadas.
- A edição externa disponível cobre orçamento e entrega. Alterar criativo, objetivo ou calendário de objetos já publicados exige Ads Manager; duplicar cria um novo rascunho. Alterações externas são detectadas por leitura e revisão antes/depois.
- A descoberta de hierarquia é paginada. Insights de entidades usam jobs explícitos; abrir filtro/detalhe não dispara sincronização por linha. O cancelamento de relatório assíncrono é local, sem alegar cancelamento do processamento Meta.
- Alcance/frequência só aparecem com agregado exato compatível. Contas de moedas distintas não são somadas. Leads reportados, submissões e atendimentos são conceitos separados; teste sintético não entra no funil comercial.
- Exportação cobre até 5.000 linhas e 367 dias no snapshot autorizado; acima disso a solicitação é recusada explicitamente para dividir o escopo. Mais de 250 linhas usa fila durável. Relatórios pequenos também persistem antes de renderizar.
- O formulário **Formulário 01 - Teste (1777544653520055)**, Página **Cordial Imóveis (100439165679870)**, foi escolhido por estar ativo, acessível, sem campanha associada encontrada e conter perguntas de compra/financiamento imobiliário. Finalidade CRM `compra`; tipo `outro` é somente do teste. O outro formulário com “Compra” no nome trata de vestuário e foi descartado após ler suas perguntas.

## Operação

1. **Reconexão e permissões:** em Configurações → Integrações, conferir conexão/Página/conta, tipo de credencial, diagnóstico e evidência de cada capacidade. Token OAuth pessoal pode solicitar autorização adicional por finalidade; usuário do sistema exige rotação administrativa pelo caminho seguro existente. Não colar credencial no chat ou navegador de Marketing.
2. **Rotação:** atualizar a referência de segredo no backend, executar diagnóstico mínimo, conferir expiração/escopos/ativos e uma leitura autorizada. Invalidar cache de diagnóstico. Não concluir escrita por GET nem trocar a versão Graph por hábito; probes desta execução usaram v26.0.
3. **Monitoramento:** conferir idade/cobertura de métricas, filas e leases, erros sanitizados e último atendimento real/sintético. Ausência de lead não comprova defeito. Não repetir credencial inválida indefinidamente nem reiniciar teste parado por cota.
4. **Workers:** `ads-sync` conserva a origem estável do projeto e `worker_hook_token` no header existente. Leads conserva `internal_worker_headers()` e seu cofre. Jobs Insights/PDF usam o despacho de anúncios com falhas isoladas; não foi criado um terceiro mecanismo de autenticação.
5. **Reprocessamento:** lead recuperável pela ação autorizada; mapeamento/identidade ambígua exige revisão. Recovery usa formulários autorizados, janela limitada, cursor/checkpoint e dedupe. Não promete histórico ilimitado nem ressuscita tombstones. Comando de anúncio incerto exige reconciliação antes de retomar.
6. **Rollback:** retornar o código anterior e ocultar novos controles; preservar tabelas aditivas, histórico, arquivos privados, IDs externos e comandos incertos. Não remover políticas de isolamento nem reverter a autorização exata com uma regra geral. Não excluir ativos na Meta.

Detalhes: [comandos](meta-ad-command-runbook.md), [teste sintético](meta-lead-synthetic-runbook.md), [UX e medidas](meta-marketing-ux.md). A aplicação das migrações e a execução real possuem evidência própria; este documento não implica deploy.

## Verificação de entrega

- **Banco aplicado:** journal passou de 47 para 57 entradas. Migrações 0047–0056 conferidas por SHA256 e `created_at` no banco real, em transações por entrada com guarda de ordem e ensaio rollback. A primeira execução de ensaio da 0055 revelou um terminador PL/pgSQL duplicado, corrigido antes da aplicação. Evidência: [migrações e permissões reais](evidence/meta-migrations-2026-10-28.json).
- **Papéis reais:** `SET LOCAL ROLE authenticated` com identidade de Bianca confirmou as concessões por ação nas duas imobiliárias e recusou finanças/administração de conexão. Revisor existente foi recusado em RPCs privadas e ações de escrita/contatos; esse cadastro não tem imobiliárias atribuídas, portanto não ganhou acesso a métricas reais de Cordial. Papéis combinados e troca maliciosa de contexto foram testados em PostgreSQL local, sem mudar papéis de usuários reais.
- **Sessão autenticada disponível ao final:** o Marketing de produção foi inspecionado em desktop e mobile, ainda com a interface anterior de três áreas e onze KPIs. Abrir sem período produziu `competence=1969-12`; o padrão agora é calculado durante a leitura da URL. A captura de produção ocorreu depois das alterações locais e antes de qualquer publicação desta branch. Não é alegada uma auditoria autenticada completa anterior à implementação. Arquivos reais permanecem fora do GitHub; nenhuma ação de sincronização/criação foi clicada em produção.
- **Evidências locais:** [capturas e vídeo sintéticos](evidence/marketing/README.md), [PDF de campanhas](../output/pdf/marketing-synthetic-sample.pdf) e [PDF de hierarquia](../output/pdf/meta-ads-hierarquia-sintetico.pdf). O vídeo é uma sequência editada de capturas reais, não uma medição de tempo de tarefa.
- **Testes finais:** 179 testes Vitest em 28 arquivos e 68 testes de contratos/SQL em `tests/ads` passaram; `tsc --noEmit` e build Vite/Nitro concluídos. São testes locais, incluindo PostgreSQL PGlite, sem somá-los a chamadas reais. A [inspeção estática do bundle do navegador](evidence/security-browser-bundle.json) não encontrou os padrões de credenciais/Graph avaliados; isso não é prova absoluta de ausência de vazamento em qualquer execução.
- **Lead Ads externo:** [registro completo da execução](evidence/meta-lead-live-test-2026-10-28.md). A Meta recusou a criação sintética final com HTTP 400, código 2/subcódigo 1892059; reconciliação confirmou zero testes. Nenhum ID, submissão ou atendimento foi criado; webhook, importação e reentrega permanecem sem prova externa. A causa raiz não foi determinada. O token válido e as inscrições confirmadas não comprovam todas as operações ou acesso avançado.
- **Publicação:** nenhuma nova interface ou handler desta branch foi publicado. Migrações aplicadas são compatíveis com o código existente; o Marketing publicado continuou abrindo e o cron existente manteve sua coleta. Não houve criação/ativação de anúncios ou aumento de orçamento.
