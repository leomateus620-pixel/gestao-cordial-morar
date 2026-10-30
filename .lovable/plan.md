# Acesso completo ao Marketing para Bianca e Bruna

## Situação verificada hoje
- **Bruna Weremchuk (administradora)**: já tem acesso total ao Marketing (Meta Ads, Google Ads, relatórios, campanhas, leads, Cordial e Morar). Nada a mudar.
- **Bianca Regina (secretária)**: já vê o menu Marketing, leads e relatórios, e pode criar/editar campanhas Meta, mudar orçamento e ligar/pausar entregas (Cordial e Morar). **Falta**:
  - baixar o relatório financeiro (com investimento detalhado);
  - qualquer permissão nova que for criada no Marketing no futuro (hoje cada uma precisa ser liberada manualmente).

## O que será feito
1. Criar no banco uma liberação "Marketing completo" por pessoa e imobiliária. Quem a tiver recebe automaticamente **todas as permissões operacionais do Marketing, atuais e futuras**, em Meta e Google.
2. Conceder essa liberação à Bianca para Cordial e Morar (Bruna já tem tudo como administradora).
3. Continua exclusivo do administrador: conectar/desconectar contas de anúncio (tela Integrações), conforme regra já existente do sistema.
4. Perfil de revisão da Meta continua só com leitura.
5. Testes: Bianca passa a ter todas as ações, exceto conexão; outra secretária sem liberação continua como antes; revisor Meta continua só leitura.

## Detalhes técnicos
- Migração aditiva: aceitar ação `marketing_full` em `marketing_action_grants`; em `marketing_actor_can_act`, para secretária, tratar `marketing_full` da imobiliária como permissão para qualquer ação da lista, exceto `manage_connection`. Nova ação adicionada à lista herda automaticamente.
- INSERT das linhas da Bianca (cordial, morar) com motivo registrado; nenhuma linha existente é apagada.
- Política restritiva `meta_reviewer_block` preservada.
- Teste em `access-control`/marketing para as regras acima.
