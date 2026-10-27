# Importar campanhas reais da Meta para o Marketing

## Situação atual (conferida)
- O Marketing do Gestão não tem nenhuma campanha cadastrada; nenhuma conta de anúncios foi importada.
- A conexão Meta da Cordial (conta 1010379113136989) aparece com status "erro" no último diagnóstico (26/10). Nos testes de ontem, as leituras diretas na Meta funcionaram (57 campanhas, 206 conjuntos, 312 anúncios). A causa desse erro ainda não foi confirmada.
- O Gestão já tem as funções de buscar contas, listar campanhas, importar e sincronizar resultados. Elas só funcionam para o administrador.

## Etapas
1. **Rodar o diagnóstico de novo.** Se continuar com erro, ver qual teste falha (token, conta, Página) e corrigir essa causa antes de seguir. Os segredos não serão trocados.
2. **Registrar a conta de anúncios** da Cordial no Gestão pelo fluxo de descoberta que já existe.
3. **Importar as campanhas reais:**
   - Entram todas as campanhas não excluídas nem arquivadas (até 57), com nome, objetivo, status e datas.
   - Em seguida, uma sincronização busca os resultados por dia dos últimos 90 dias: investimento, impressões, cliques e leads.
   - A importação é só leitura na Meta: nenhum anúncio é criado, ativado, pausado ou alterado.
4. **Conferir:**
   - Entrar com a conta de avaliação e confirmar que as campanhas e os números aparecem no Marketing.
   - Abrir no Gestão uma campanha e comparar investimento e cliques com o Gerenciador de Anúncios.
5. **Publicar** depois da conferência.

## Fora do escopo
- A conta de avaliação continua sem poder importar, sincronizar ou mudar a conexão. Ela só vê e edita dados no Marketing.
- Nenhuma alteração em imóveis, clientes ou outras áreas.

## Detalhes técnicos
- As funções usadas são `diagnoseMetaConnection`, `listMetaAccounts` (grava em ad_accounts), `listMetaCampaigns`, `importDiscoveredMetaCampaign` e `syncCampaign`, executadas no servidor como administrador. As campanhas entram em marketing_campaigns e os resultados diários em marketing_daily_metrics.
- A importação é feita uma campanha por vez, em ritmo baixo, de olho no limite de uso da Meta. Ela para se o uso passar de 85% ou se aparecer erro de permissão.
- Não há migração de banco nem mudança de regras de acesso. Se o diagnóstico revelar um defeito no código, a correção fica restrita a src/lib/ads, conforme o AGENTS.md dessa pasta.
