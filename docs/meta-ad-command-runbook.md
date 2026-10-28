# Comandos Meta: contrato, operação e limites

Implementação de 28/10/2026. Não foi executada criação, ativação, alteração de orçamento ou upload real durante o desenvolvimento. Os testes mencionados abaixo simulam respostas Graph; o teste SQL usa PostgreSQL local via PGlite. Isso não comprova escrita autorizada na conta de produção.

## Formatos implementados

O assistente aceita uma imagem JPEG/PNG selecionada explicitamente, Feed do Facebook, país BR, conta BRL, orçamento diário ou total, destino site (`OUTCOME_TRAFFIC` / `LINK_CLICKS`) ou formulário instantâneo ativo e mapeado (`OUTCOME_LEADS` / `LEAD_GENERATION`). Sempre declara `HOUSING` e `special_ad_category_country: [BR]`. Não permite introduzir parâmetros Graph arbitrários, segmentar idade/gênero, outros países, carrossel, vídeo, mensagens ou outros posicionamentos. Essas combinações devem usar o Ads Manager enquanto não houver implementação e prova por conta.

BRL é uma restrição explícita deste primeiro assistente: o orçamento transmitido é uma string de centavos inteiros. Outras moedas são bloqueadas, sem presumir duas casas para todas elas. Datas são ISO com offset explícito; a interface mostra o fuso da conta. Orçamento total exige término. O produto aceita imagens de até 5 MB e 20 MP, mínimo 600 × 600, proporção 4:5 a 1,91:1. São limites conservadores do assistente; não representam todos os formatos aceitos pela Meta.

A enumeração HOUSING/BR foi conferida no SDK oficial. Não se transferiram automaticamente regras específicas dos EUA (raio, idade etc.) ao Brasil. A página de políticas especiais não ficou acessível e a página de criação retornou 429 nesta execução. A aceitação efetiva da combinação e requisitos regionais continuam sujeitas à validação da Meta; não foi demonstrado que todas as contas aceitam a combinação.

Fontes primárias consultadas:

- [AdAccount: criação de campaign/adset/adcreative/ad, adimages e promote_pages](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py).
- [Campaign: HOUSING, BR, objetivos, estados](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/campaign.py).
- [AdSet: orçamento, destino, otimização, estados](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adset.py).
- [AdCreative: object_story_spec e CTAs](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py).

Essas fontes verificam nomes/campos de contrato, não escopos efetivos, aprovação de anúncios, acesso avançado ou conformidade de uma campanha específica. `META_GRAPH_API_VERSION` continua configurável, com o fallback existente. Nenhum GET é tratado como prova de `ads_management`.

## Persistência e recuperação

A migração aditiva 0048 cria `meta_ad_drafts`, `meta_ad_commands`, `meta_ad_command_events` e `meta_ad_hierarchy`, sem substituir campanhas manuais/importadas. Os objetos externos são strings; cada linha conserva conexão, imobiliária e conta. FK composta impede ligar um rascunho/comando a outra imobiliária. O contexto atual de conta/Página é revalidado antes de cada intenção. RLS está habilitada; acessos diretos de `anon/authenticated` são revogados e todas as tabelas recebem `meta_reviewer_block` restritiva. RPCs são exclusivas de `service_role`, fixam search_path e revalidam a ação do ator, negando `meta_reviewer` mesmo combinado com admin. A migração 0054 acrescenta concessões explícitas em `marketing_action_grants`: conforme a autorização nominal do responsável, Bianca pode ler orçamento operacional, criar rascunho, enviar pausado, mudar orçamento e pausar/ativar nas imobiliárias às quais pertence (Cordial e Morar, quando os vínculos atuais existirem). Cada operação consulta novamente os vínculos e sua concessão. Esse acesso não concede administração de conexão, credenciais ou relatório financeiro, e não é estendido aos demais corretores/secretárias. O administrador conserva as ações previstas na política. Rascunhos e detalhes que contêm orçamento exigem `read_ad_budget` além da ação correspondente.

1. Salvar aceita rascunho incompleto e usa revisão otimista. Só a resposta confirmada permite mostrar “salvo”.
2. Enviar exige payload completo e confirmação `CREATE_PAUSED`. Uma intenção única por rascunho/revisão e uma lease por rascunho impedem clique duplo.
3. Cada passo grava `sending` antes do POST. Após receber o ID, grava o ID antes de consultar o objeto. Só avança depois de confirmar conta, vínculo, identidade e status `PAUSED`.
4. Uma resposta definitiva de parâmetro/permissão pode ser retomada explicitamente após corrigir a pendência. Passos já confirmados não são repetidos. Falha anterior a qualquer ativo externo permite editar o rascunho e salvar nova revisão. Configuração de etapas já criadas não pode ser modificada silenciosamente.
5. Timeout, corpo inválido ou interrupção com POST em andamento ficam incertos. Lease vencida com passo `sending` vira `uncertain`, nunca repete o POST. Nenhum gatilho/cron ativa ou retoma comandos.
6. “Reconciliar” só lê: usa ID persistido ou procura o marcador exato `GC:<command_uuid>:<step>` na conta. Zero resultados não prova inexistência; múltiplos resultados não são escolhidos. Um único candidato ainda precisa passar pelas validações de contexto e dependências. Após reconciliar, a retomada exige ação explícita.
7. Jamais excluir ativos externos como compensação. Se ausência/ambiguidade persistir, conferir o marcador e IDs no Ads Manager antes de qualquer decisão manual.

A chamada Graph não oferece uma transação SQL nem um CAS geral. Pausa/ativação/orçamento fazem leitura anterior, verificam hashes de configuração e confirmação posterior. Um conflito com alteração no Ads Manager bloqueia o comando. Ainda existe uma janela inevitável entre leitura e escrita externa; a leitura posterior e o histórico tornam a divergência detectável. A ativação inicia pelo anúncio/conjunto e só ativa a campanha ao final; a pausa começa pela campanha. Ambas exigem confirmação própria e jamais são efeito da criação.

A hierarquia descoberta usa GET paginado explícito, nunca uma chamada por linha renderizada. O cache conserva status configurado e efetivo. Falha de coleta não apaga snapshots anteriores; `read_at` identifica a idade. As métricas diárias de campanha continuam na fonte existente. A migração 0052 e o worker de Insights acrescentam jobs assíncronos persistentes para campanha, conjunto e anúncio, com grão diário ou agregado de período e breakdown nenhum ou plataforma de publicação. A consulta usa o contexto de uma campanha importada, limita cada janela a até 94 dias, acompanha progresso e paginação e só torna o snapshot visível após conclusão. Estados de resposta parcial/vazia, expiração, cancelamento e resultado incerto são distintos; uma falha não substitui um snapshot anterior válido. A UI solicita o job explicitamente e lê resultados armazenados. Não há backfill irrestrito disparado por renderização ou pelo cadastro de um anúncio; janelas maiores precisam ser divididas. O contrato e os testes locais não substituem a comparação externa com o Ads Manager no mesmo recorte.

## PDFs privados e fila de geração

Campanhas e snapshots de conjuntos/anúncios compartilham o renderer e a infraestrutura privada de relatórios. O PDF contém todas as linhas autorizadas do snapshot, até 5.000, com hash, autor, versão e escopo. O limite do relatório de campanhas é 367 dias; o snapshot de Insights mantém a janela suportada pelo job. Não há conversão implícita de moedas nem exposição financeira por uma concessão de orçamento operacional.

A migração 0056 torna a geração durável: até 250 linhas tenta renderizar na requisição após enfileirar; acima disso retorna `queued`. O worker existente de anúncios processa um PDF por despacho após campanhas e Insights, com tratamento de falha próprio e sem mudar autenticação ou cron. Lease, fencing e três tentativas limitadas permitem recuperação após fechamento da tela/interrupção. O snapshot é imutável; a fila revalida `generate_report` e, quando necessário, `financial_report` no claim e na conclusão. O download exige o autor e autorização vigente, usando URL assinada curta em bucket privado. A interface acompanha fila/processamento no histórico e só apresenta conclusão para `ready`.

O caminho de cada tentativa incorpora seu fencing, impedindo sobrescrita por worker antigo. Arquivos com commit incerto não são apagados automaticamente. Consulte [a operação da fila de PDFs](marketing-report-jobs.md) para retenção de órfãos privados, códigos de falha e retomada. Nenhum job de relatório autoriza gasto ou mutação de anúncio.

## Aceite externo pendente

- Confirmar permissões `ads_management`, acesso efetivo da conta/Página e os requisitos do formato no país. Token de usuário do sistema continua sem fluxo OAuth pessoal.
- Com ordem explícita do responsável, enviar um rascunho sintético pausado, registrar os quatro IDs e confirmar estados no Ads Manager. Upload de imagem também é uma operação externa explícita.
- Conferir que nenhuma campanha/conjunto/anúncio ficou ativo, testar pausa e edição permitida e simular uma perda de resposta controlada antes de declarar capacidade comprovada.
- `validate_only` não é invocado nesta versão. Validação local/GET de ativos não equivale à validação de escrita pela Meta.
- Prévia local de conteúdo não é uma prévia oficial de posicionamento da Meta. Formatos e edições além dos comandos implementados permanecem no Ads Manager.

Rollback do código deve esconder os novos controles e preservar tabelas, comandos, eventos, snapshots de Insights e arquivos privados. A fila PDF pode ter seu despacho suspenso independentemente sem alterar o cron ou a autenticação de anúncios; retome com código compatível com 0056, sem voltar a gravar `generating` diretamente. Não apagar tabelas, rascunhos com IDs, relatórios ou objetos na Meta. Uma operação incerta deve continuar visível para reconciliação após restaurar o código.

As concessões `send_paused`, `change_budget` e `set_delivery` podem ser revogadas individualmente por imobiliária, sem alterar os papéis globais de Bianca. Para retirar também acesso aos rascunhos e à gestão com orçamento, revogar `read_ad_budget`: o papel secretária já permite `create_draft` na política base, portanto remover somente esse grant não bloqueia a operação enquanto `read_ad_budget` continuar concedido. Revogação não desfaz comandos já confirmados na Meta.
