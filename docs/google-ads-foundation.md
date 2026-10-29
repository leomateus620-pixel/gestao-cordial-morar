# Google Ads: fundação em andamento

Esta etapa não torna a integração operacional. A visualização, os relatórios e os leads Google permanecem indisponíveis até que a cobertura, a agregação e o isolamento de contas sejam concluídos e validados com uma conta autorizada.

## Configuração externa

No projeto Google Cloud proprietário das credenciais OAuth, habilite a Google Ads API e configure o consentimento e o acesso adequado para a conta de teste ou produção. Configure `GOOGLE_ADS_CLIENT_ID` e `GOOGLE_ADS_CLIENT_SECRET` no ambiente protegido do servidor e registre exatamente a origem de produção seguida de `/api/public/ads-oauth/callback` como URI de redirecionamento. `GOOGLE_ADS_API_VERSION` aceita `v26`; se omitida, usa essa versão. Não coloque credenciais em arquivos versionados ou mensagens.

A presença dessas variáveis não prova acesso à conta nem aprovação do projeto Cloud. Developer tokens foram descontinuados em 09/09/2026 e não são enviados por este adaptador. A versão v26 foi publicada em 14/10/2026. Referências: [migração do acesso](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) e [notas da API](https://developers.google.com/google-ads/api/docs/release-notes?refresh=1).

## Limites desta etapa

- A migração Drizzle `0057_google_metrics_contract` separa conversões fracionárias de leads e exige o novo contrato no worker. `spend` conserva o decimal recebido; as colunas legadas de investimento continuam com escala monetária própria.
- A descoberta cobre contas diretamente acessíveis. A migração `0058_google_bind_account` associa conta e conexão atomicamente após a verificação externa. Hierarquias de contas administradoras exigem rota de acesso por vínculo e não são suportadas nesta etapa.
- A importação e o worker Google permanecem bloqueados até haver cobertura e reconciliação adequadas; a autorização e o vínculo não certificam coleta de métricas.
- As consultas e relatórios compartilhados ainda não têm totais Google com cobertura, moeda e fuso comprovados. Não use zeros de leads como conversões; relatórios que incluam Google são recusados.
- Estão pendentes a visualização analítica dedicada, recuperação de leads e CRM, relatórios Google, gestão de campanhas, reconciliação completa, testes com conta real e verificação visual em todas as larguras solicitadas.
- O refresh usa comparação ao gravar para não substituir uma renovação concorrente, mas ainda não possui serialização distribuída das chamadas externas.

Não altere a autenticação ou o cron existentes do worker Meta ao evoluir esta integração. A migração está no journal; a aplicação direta deve registrar o mesmo hash e timestamp no histórico Drizzle na mesma transação, após confirmar o estado anterior.
