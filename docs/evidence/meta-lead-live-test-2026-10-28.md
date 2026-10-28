# Lead Ads → CRM: resultado externo em 28/10/2026

**Resultado: bloqueado na criação do lead de teste pela Meta. O fluxo ponta a ponta não foi comprovado.** Não foram criados lead externo, autorização de teste, submissão, cliente ou atendimento. Não houve envio de mensagens nem alteração de anúncios, credenciais ou vínculos existentes.

## Contexto autorizado

- Projeto Lovable `feb646c9-c19a-4360-8cc9-bec5237532ea`, conexão existente `d99c000d-58fc-47dd-b7b7-fc85f62053a0`, destino Cordial.
- App `2739298586487785`; Página **Cordial Imóveis**, `100439165679870`; conta de anúncios `1010379113136989`.
- Responsável confirmado: cadastro único existente **Leonardo**, `d3abe478-5f0f-480e-b2d5-d9c9762bd8c4`, administrador elegível com vínculo à Cordial. Nenhum perfil foi criado ou alterado.
- Formulário escolhido: **Formulário 01 - Teste**, `1777544653520055`, ativo, português brasileiro, perguntas de compra/financiamento imobiliário; nenhuma associação a anúncio/campanha encontrada na leitura disponível. Finalidade aceita pelo CRM: `compra`; tipo `outro`, somente para o cenário sintético.
- Outros formulários consultados: **Dúvidas/Conteúdos**, `1681267895961314`, associado à campanha `[BRASA][Cadastro][Forms.] Conteúdo`, `120211941448760234`; **Cadastro para Interesse Compra**, `1163387601319444`, descartado porque as perguntas tratavam de vestuário, não de imóveis.

A migração 0053 permite autorizar somente uma identidade exata de teste, confirmada em `test_leads`, com validade curta. Não foi criado mapeamento geral para o formulário. Os dados propostos eram explicitamente sintéticos, com email `@example.invalid` e sem telefone de pessoa real. O marcador textual sem dígitos da tentativa final normalizaria para telefone nulo no CRM; não houve importação.

## Evidência por etapa

| Etapa | Resultado observado |
|---|---|
| Credencial existente | `debug_token`: válida, tipo SYSTEM_USER; escopos declarados incluem `leads_retrieval`, `pages_manage_metadata`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`, `ads_management`, `ads_read` e `business_management`. Isso não comprova acesso avançado nem cada operação. |
| Inscrição do app | Objeto Page / campo leadgen ativo. |
| Inscrição da Página | Confirmada para o app e leadgen usando token de Página obtido no backend e mantido em memória. A tentativa anterior com SYSTEM_USER nesse endpoint recebeu 190/2069032 e foi corrigida; não comprova ausência de permissão. |
| Precondições | Zero leads de teste existentes e zero mapeamentos gerais ativos para o formulário. |
| Criação sintética final | POST Graph **v26.0**, com token de Página e `field_data`: **HTTP 400, código 2, subcódigo 1892059**, request ID `AFipC7fBHOJGaeRCwuKcZE-`. |
| Reconciliação externa | GET test_leads retornou zero após a recusa; nenhum ID externo disponível. |
| Autorização exata / webhook / recuperação | Não executados para um novo teste: dependem de um ID confirmado. Nenhum webhook foi fabricado para declarar sucesso. |
| Submissão / cliente / atendimento Cordial → Leonardo | Não criados; identificadores inexistentes. |
| Reentrega sem duplicação | Não executada externamente. A garantia possui testes locais identificados, não evidência ponta a ponta. |

## Contagem e limitações da execução

As rodadas de tentativa/diagnóstico abaixo totalizam **19 chamadas Graph: 14 GET e 5 POST recusados**. Consultas de inventário anteriores são separadas e não estão incluídas nesse total. Esses números não são métricas de sucesso ou de Testing.

| Rodada | GET | POST | Resultado |
|---|---:|---:|---|
| Primeira tentativa pelo conector | 3 | 2 | Envelope inicial incorreto, campos no nível superior; ambas recusadas. O agente efetuou uma repetição além do limite solicitado; isso foi identificado e as rodadas posteriores foram delimitadas explicitamente. |
| Correção para `field_data` | 3 | 2 | Telefone vazio recebeu código 100; omissão do telefone recebeu 2/1892059, request ID `AC6lVfWssym262GSPeS9HBc`. Leituras confirmaram zero testes. |
| Diagnóstico de token/app/Página | 3 | 0 | Token válido, app inscrito; consulta da Página com tipo de token inadequado recusada. |
| Verificação corrigida da Página | 2 | 0 | Token de Página obtido em memória; app/leadgen inscritos. |
| Tentativa final com token de Página | 3 | 1 | Recusada com 2/1892059; reconciliação vazia; nenhuma nova tentativa automática. |

O contrato `field_data` foi conferido no [SDK oficial da Meta, LeadgenForm.create_test_lead](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/leadgenform.py). A confirmação do contrato, dos escopos e das inscrições **não exclui** limitações de payload, ativo, nível de acesso ou credencial efetiva. **A causa raiz permanece desconhecida.** Não se adota a conclusão excessiva do conector de que todos esses fatores estariam eliminados.

## Próxima ação externa e preservação

Inspecionar uma execução na Lead Ads Testing Tool ou encaminhar os request IDs `AFipC7fBHOJGaeRCwuKcZE-` e `AC6lVfWssym262GSPeS9HBc` ao suporte Meta, verificando o acesso efetivo à operação nesse formulário. Não repetir POST automaticamente nem substituir por contato real. Depois de um ID confirmado, retomar o [runbook de isolamento](../meta-lead-synthetic-runbook.md) e provar cada etapa, incluindo reentrega.

A consulta agregada final preservou **57 campanhas Meta e 73 linhas diárias**, com **0 mapeamentos, 0 submissões e 0 autorizações de teste**. Nenhum teste anterior foi excluído. O estado configurado não foi promovido a fluxo operacional comprovado.
