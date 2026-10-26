# Meta Ads e Lead Ads — Gestão Cordial

Registro de execução: 26/10/2026. Projeto Lovable `feb646c9-c19a-4360-8cc9-bec5237532ea`, conta **Cordial Gestao**, repositório `leomateus620-pixel/gestao-cordial-morar`.

A base inicial foi reconfirmada em `992b0aab1b9b9af8a6a69b1ad5a4bd10bba6aeee`. Durante a inspeção, o Lovable gravou apenas seu arquivo de planejamento; o checkout foi sincronizado com `c0ebc42d9283c4205a52ef806f541017b1f82dbe` antes da entrega. A implementação permanece em uma branch própria, sem publicação do frontend.

## Estado externo observado

- Supabase habilitado. O banco informou 39 entradas no journal Drizzle, até 0038.
- Conexões, contas e campanhas estavam vazias. Nenhum valor de token, segredo ou dado pessoal de lead foi consultado para o relatório.
- A prévia inicialmente redirecionou ao login. Depois que o usuário entrou, Marketing e Integrações atuais foram acessados e capturados: Marketing sem campanhas, conectores Meta/Google não configurados e nenhum painel Meta na tela antiga de Integrações. As novas telas foram verificadas localmente com fixtures sintéticas; a branch nova ainda não foi incorporada ao runtime Lovable. As capturas autenticadas ficam fora do Git por conterem contexto administrativo.
- `GET https://cordialgestao.com/api/public/meta/leadgen?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=probe` retornou **HTTP 404** em 26/10/2026. Isso comprova ausência do endpoint nessa implantação, não autenticação de webhook.
- Segundo a inspeção do Lovable, rotas de servidor e frontend são publicados juntos. Não há deploy separado comprovado para esse endpoint no fluxo disponível.
- A migração desta PR contém revogação de acessos diretos antigos. Aplicá-la antes de disponibilizar os handlers compatíveis pode interromper o Marketing do runtime antigo. Aplicação e ativação devem ser coordenadas com a implantação aprovada; arquivo SQL e testes locais não comprovam aplicação no banco ativo.

## Credenciais

Entrada segura: [editor do projeto](https://lovable.dev/projects/feb646c9-c19a-4360-8cc9-bec5237532ea) → **Project Settings → Secrets**. O conector informou não ter ferramenta para abrir o formulário seguro remotamente. Nunca enviar valores pelo chat, PR ou arquivo versionado.

| Chave                                        | Estado confirmado no backend pela inspeção Lovable | Uso                                                    |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| META_APP_ID                                  | Pendente                                           | Aplicativo emissor e roteamento                        |
| META_APP_SECRET                              | Pendente                                           | Assinatura POST e diagnóstico do aplicativo            |
| META_ACCESS_TOKEN                            | Pendente                                           | Usuário do sistema explicitamente associado à Cordial  |
| META_PAGE_ID                                 | Pendente                                           | Página; confirmar também no vínculo administrativo     |
| META_AD_ACCOUNT_ID                           | Pendente                                           | Conta; string, sem converter para número               |
| META_WEBHOOK_VERIFY_TOKEN                    | Pendente                                           | Challenge GET; diferente do access token               |
| META_GRAPH_API_VERSION                       | Pendente                                           | Versão Graph centralizada; conferir pin e diagnóstico  |
| WORKER_HOOK_SECRET                           | Configurada, valor não consultado                  | Autenticação interna de workers                        |
| ADS_CREDENTIAL_ENCRYPTION_KEY                | Pendente                                           | Chave base64 de 32 bytes para OAuth dinâmico protegido |
| META_PAGE_ACCESS_TOKEN ou referência própria | Não verificada; condicional                        | Token da Página quando a recuperação exigir esse tipo  |

`system_user` usa referência de variável de ambiente; não exige login OAuth e não passa por troca/renovação de token pessoal. OAuth continua disponível com credenciais criptografadas no servidor. Registros legados não são apagados antes de haver caminho protegido verificado. Uma credencial sem expiração informada pode ser revogada.

Uma conexão Morar precisa de referência própria e ativos validados. A ausência desse cadastro mantém a Morar não configurada. Não copiar implicitamente o token Cordial.

## Capacidades e ativação

| Capacidade                                        | Evidência real nesta execução |
| ------------------------------------------------- | ----------------------------- |
| Credencial Meta presente                          | Pendente de entrada segura    |
| Token válido / aplicativo emissor                 | Não testado com token real    |
| Conta e campanhas legíveis                        | Não testado com conta real    |
| Página e leads legíveis                           | Não testado com token real    |
| Webhook do aplicativo configurado                 | Não comprovado                |
| Página inscrita em leadgen                        | Não comprovado                |
| Última sincronização real                         | Nenhuma                       |
| Ciclo oficial Meta → webhook → fila → Graph → CRM | Pendente                      |

Não cadastrar um callback como se já estivesse ativo. A URL **prevista**, depois de implantação e verificação externa, é `https://cordialgestao.com/api/public/meta/leadgen`. Nesta execução ela retornou 404. Não há URL nova de callback comprovadamente implantada.

Após o runtime compatível estar publicado:

1. Confirmar externamente que o GET com verify token correto devolve exatamente o challenge em texto, e que o token incorreto é rejeitado. A prévia protegida não serve de callback público.
2. Em Meta for Developers → aplicativo correto → Webhooks → objeto **Page**, cadastrar a URL confirmada e o verify token pelo formulário da Meta, e assinar o campo **leadgen**. A interface Meta pode variar; conferir o objeto e o campo pelo diagnóstico.
3. Inscrever a Página em `/{page-id}/subscribed_apps` para `leadgen` com token aceito pelo endpoint e `pages_manage_metadata`; preservar a união dos campos já assinados. Ler o estado após a operação. O sistema não faz essa escrita automaticamente ao diagnosticar.
4. Validar `ads_read` para anúncios; `leads_retrieval` e acesso efetivo aos leads para recuperação. Listagem da Página pode exigir `pages_show_list`; não presumir permissões por caixas marcadas. Não exigir indiscriminadamente `ads_management`/`business_management` para leitura de anúncios.
5. Ativar crons apenas depois de confirmar as rotas dos workers e `public.internal_worker_headers()`. A credencial pública não autentica workers. Conferir origem HTTPS configurada, jobs e execução concluída; cron existente não comprova execução.
6. Usar a ferramenta oficial [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) para gerar uma submissão de teste. Registrar `leadgen_id`, fila, vínculo do atendimento e estado final sem reproduzir PII. Um POST sintético ou challenge bem-sucedido não substitui esse teste. Nenhum anúncio, gasto ou mudança de orçamento é necessário.

## Operação cotidiana

- **Conectar:** administrador, Configurações → Integrações → Meta Ads; cadastrar metadados/referências e executar diagnóstico. Cada capacidade mostra seu próprio estado.
- **Sincronizar:** selecionar imobiliária/conta/período no Marketing; importar campanhas descobertas ou por link e agendar sincronização. O navegador acompanha jobs persistidos; não executa a fila.
- **Mapear formulário:** vincular Página/formulário à marca e definir os campos de contato. Finalidade, tipo de imóvel, imóvel e corretor só recebem valores por configuração explícita. Campos obrigatórios ausentes levam a Revisar, preservando a submissão.
- **Distribuir:** abrir Leads Meta, filtrar A distribuir e atribuir corretor autorizado na marca. Abrir o atendimento pelo vínculo interno. O ID Meta não é um ID interno do CRM.
- **Recuperar falha:** revisar diagnóstico, corrigir referência/permissão/mapeamento e reprocessar pela ação administrativa. Falhas de permissão/revogação não repetem agressivamente; leases vencidos permitem recuperação de interrupções.
- **Privacidade:** fila guarda os identificadores necessários ao roteamento, sem corpo bruto do webhook. Campos recuperados ficam restritos ao serviço/operadores autorizados. Não há mensagem automática externa para o lead por esta integração.

## Métricas

Leads reportados pela Meta, submissões recebidas e atendimentos/clientes únicos são contagens diferentes. O provider registra as ações e a família escolhida para auditoria, sem somar aliases sobrepostos nem escolher o máximo. A taxonomia adotada é documentada no provider; comparar somente recortes de atribuição compatíveis.

Cliques não são visitas. Visualizações de página de destino permanecem uma métrica separada. Alcance diário não é somado como pessoas únicas no mês; alcance e frequência precisam do agregado exato do provider para o mesmo período e escopo. Várias campanhas/contas não significam deduplicação de pessoas. Não somar moedas diferentes. CPC/CPL/CPM com denominador zero ficam indisponíveis.

## Referências primárias consultadas

As páginas principais de developers.facebook.com retornaram 429/indisponibilidade nas tentativas desta execução. A versão e os endpoints foram conferidos também em fontes primárias do SDK; isso não substitui teste com ativos reais.

- [Meta Business SDK oficial](https://github.com/facebook/facebook-nodejs-business-sdk/releases)
- [Catálogo oficial de verificação de recuperação de leads](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md)
- [Webhooks e recuperação de Lead Ads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/)
- [Assinaturas de aplicativos da Página](https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/)

Resultados finais de testes, modelo de dados e evidências de UI são registrados em `validacao.md` nesta pasta.
