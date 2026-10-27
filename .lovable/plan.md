# Conta de avaliação para a Meta (somente Marketing)

## Objetivo
Uma conta exclusiva para os analistas da Meta entrarem em https://cordialgestao.com/login e verem só o Marketing e a parte de Integrações ligada ao Meta Ads, sem acesso ao resto do sistema.

- E-mail: leonardopjjcmateus56@gmail.com
- Senha: facebookapi2026 (a que você informou)

## O que a conta vai ver
- Menu lateral: apenas **Marketing** e **Integrações → Meta Ads** (status da conexão, webhook de leads, conta de anúncios).
- Pode ver campanhas, resultados e relatórios do Meta Ads, e editar o que for de marketing (ex.: dados da campanha no Gestão).
- Não vê: imóveis, clientes, atendimentos, agenda, vendas, locação, NFS-e, financeiro, vistorias, assistente, configurações e as demais integrações (ImobiBrasil, Google, Drive).
- Não vê valores financeiros da empresa (comissões, faturamento). Gasto dos anúncios aparece normalmente.
- Não consegue desconectar a Meta, trocar tokens nem criar, ativar ou pausar anúncios.

## Proteção de verdade (não só esconder o menu)
Hoje, qualquer pessoa com login consegue ler a lista de imóveis direto pelo sistema (inclusive e-mails de proprietários). Uma conta externa não pode ter isso. Por isso:
- Crio um perfil novo "Avaliação Meta", separado dos perfis da equipe.
- Esse perfil fica bloqueado nas tabelas de imóveis, fotos, publicações e filas de sincronização, sem mudar nada para admin, secretária e corretor.
- Ele lê as campanhas e métricas de marketing da empresa (hoje só o admin vê as de todos).
- Abrir qualquer outra página pelo endereço mostra "Acesso restrito".

## Etapas
1. Novo perfil "Avaliação Meta" com acesso só a Marketing e Integrações (parte Meta).
2. Regras de acesso no banco: liberar leitura/edição de marketing para esse perfil e bloqueá-lo nos dados de imóveis — mudança apenas aditiva, sem apagar nada.
3. Criar a conta com o e-mail e a senha acima, já confirmada, com o perfil novo.
4. Teste entrando com a conta: conferir o menu, abrir Marketing e Meta Ads, tentar abrir Imóveis/Clientes e confirmar o bloqueio.
5. Publicar e entregar o texto pronto para colar no campo de instruções da Meta.

## Pontos de atenção
- A senha "facebookapi2026" é fraca. Recomendo trocar por uma mais forte; se preferir manter, mantenho.
- O e-mail informado parece ser pessoal seu. Ele não pode ser o mesmo da sua conta de admin. Se já existir conta com ele, uso outro (ex.: meta-review@cordialgestao.com) e te aviso.
- Depois da aprovação da Meta, posso desativar a conta.

## Detalhes técnicos
- Novo valor `meta_reviewer` no enum `app_role` e perfil `meta_reviewer` em `permissions.ts` (módulos: marketing, integracoes); mapeamento em `auth-mock.ts`; `canAccessModule`, menu e `_app.integracoes.tsx` mostram apenas o painel Meta para esse perfil.
- Migração aditiva: políticas RESTRICTIVE negando `meta_reviewer` em properties, property_images, property_sync_jobs, provider_value_maps e demais tabelas com leitura aberta; políticas de SELECT/UPDATE em marketing_campaigns, marketing_daily_metrics, ad_accounts, ad_sync_jobs via `has_role(auth.uid(),'meta_reviewer')`.
- Usuário criado pelo cliente admin no servidor (email_confirm=true) + linha em user_roles; sem DELETE de nenhum dado.
- Testes: `canAccessModule` para o perfil novo (permite marketing/integracoes, nega imoveis/clientes).
