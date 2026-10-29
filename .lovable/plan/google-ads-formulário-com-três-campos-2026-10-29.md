# Google Ads: formulário com três campos

1. Abrir o formulário seguro somente com `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_API_VERSION` (valor `v26`). Sem campo de Developer Token e sem valor fictício.
2. Chaves já salvas são preservadas (o formulário pula as existentes).
3. Não alterar o código: nada passa a exigir ou enviar o Developer Token.
4. Conferir que as três chaves estão salvas e que o login Google (OAuth) consegue iniciar com elas; o retorno usa `https://cordialgestao.com/api/public/ads-oauth/callback`, que precisa estar autorizado no Client ID do Google Cloud.
5. Depois, você clica em "Conectar Google Ads" e eu sigo com a verificação somente leitura.
