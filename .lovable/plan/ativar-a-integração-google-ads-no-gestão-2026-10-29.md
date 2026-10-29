# Ativar a integração Google Ads no Gestão

## O que já existe
- A conexão Google Ads do Marketing já espera três chaves: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_API_VERSION` (só aceita `v26`).
- O retorno do login Google já tem endereço próprio: `https://cordialgestao.com/api/public/ads-oauth/callback`.
- Ponto de atenção: o Google Ads exige também um **Developer Token** (painel Google Ads → Ferramentas → Central de API). Hoje o sistema não envia esse token, então as consultas seriam recusadas mesmo com login feito.

## Etapas
1. **Abrir o formulário seguro** com 4 campos: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_API_VERSION` (valor `v26`) e `GOOGLE_ADS_DEVELOPER_TOKEN`. Os valores vão direto para o cofre; não passam pelo chat.
2. **Conferir no Google Cloud** (você): no Client ID, em "URIs de redirecionamento autorizados", incluir exatamente o endereço de retorno acima.
3. **Ajuste mínimo no sistema**: enviar o Developer Token em todas as consultas Google Ads (e o ID da conta gerenciadora, se a conta estiver sob uma MCC). Sem token configurado, a tela mostra "não configurado", nunca dados falsos. Teste automático para essa regra.
4. **Conectar**: você clica em "Conectar Google Ads" em Marketing → Integrações, entra com a conta Google dona dos anúncios e autoriza.
5. **Verificação somente leitura**: listar contas acessíveis e campanhas (só GET/consultas), conferir totais contra o painel Google Ads.
6. **Importar campanhas e ativar atualização** no mesmo ciclo de 10 minutos já usado pela Meta, com as mesmas proteções contra apagar ou distorcer dados.
7. **Publicar** após verificação.

Nada é criado, pausado ou alterado nas campanhas do Google.

## Observação
Alternativa sem chaves próprias: a conexão Google Ads gerenciada pela Lovable (login direto, sem Client ID/Secret). Sigo com as suas chaves, como pedido, salvo se preferir a gerenciada.
