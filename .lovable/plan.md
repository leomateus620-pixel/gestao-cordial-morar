# Google Ads da Cordial completo (Morar fica parada)

## Situação atual
- A autorização Google da Cordial funciona, e a conta **Cordial Imóveis (1045014435)** já aparece para vínculo.
- Duas peças ainda faltam para os dados aparecerem:
  1. **Não existe importação de campanhas Google.** As campanhas da Meta foram trazidas por um passo próprio, que ainda não foi feito para o Google.
  2. **A atualização automática do Google está desligada de propósito no código.** Ela foi bloqueada até existir uma proteção contra dados incompletos, para evitar que a atualização apague números já guardados.

## Etapas
1. **Vincular a conta.** Gravar o vínculo da conta Cordial Imóveis à conexão Cordial pelo mesmo passo do botão "Vincular conta", com confirmação do Google. A Morar não é tocada.
2. **Importar campanhas.** Fazer uma leitura somente de consulta no Google, sem alterar nada nos anúncios, e criar no Marketing as campanhas da conta com nome, status e tipo, todas marcadas como Google e Cordial. Não cria nada em duplicidade: cada campanha é identificada pelo número dela no Google.
3. **Ligar a atualização automática do Google**, com as mesmas regras da Meta:
   - roda junto da rotina de 10 minutos que já existe;
   - campanhas ativas são atualizadas a cada ciclo e as pausadas a cada 6 horas;
   - nos dias sem nenhum registro, o Google não manda linha, então esses dias contam como zero só quando a leitura vier completa;
   - se o Google deixar de mandar um dia que já tem gasto ou impressões guardados, nada é gravado e o caso fica marcado como dado parcial;
   - os valores em dinheiro são convertidos com exatidão, de micros para reais.
4. **Primeira carga.** Trazer as métricas diárias dos últimos 90 dias de cada campanha: impressões, cliques, custo e conversões.
5. **Conferir.** Comparar os totais do período com uma leitura direta no Google e abrir Marketing → filtro Google para ver as campanhas com números. Depois, rodar os testes e publicar.

## O que não muda
- A Meta, a Morar e os anúncios no Google continuam iguais: só há leitura.
- Não serão criados nem apagados registros fora das campanhas Google da Cordial.

## Detalhes técnicos
- Vínculo: `selectGoogleAccount` → RPC `ad_google_bind_account`.
- Nova função `discoverGoogleCampaigns`, com GAQL `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status != 'REMOVED'`, e inserção idempotente por (`platform`, `external_account_id`, `external_campaign_id`).
- `sync.server.ts`: remover o bloqueio `platform === "google"` e aplicar ao Google o preenchimento de dias sem linha com zero e a regra `partial_data` já existente. `getInsights` passa a paginar por período com `segments.date`.
- Novos testes Vitest para conversão de micros, dias omitidos e proteção contra dados parciais.
- Chamadas ao Google sem `developer-token`, porque o acesso Explorer do projeto do Google Cloud já funciona assim.
