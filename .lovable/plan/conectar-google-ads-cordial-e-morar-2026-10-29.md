# Conectar Google Ads (Cordial e Morar)

## O que foi encontrado
- O aviso "Integração ainda não configurada" aparece quando o site publicado não enxerga o Client ID / Client Secret do Google no momento do clique em "Autorizar Google".
- Na prévia os dois segredos estão presentes. Eles foram salvos depois da última publicação, então o site `cordialgestao.com` provavelmente ainda roda sem eles (a confirmar na etapa 1).

## Etapas
1. Reproduzir: chamar a autorização do Google na prévia e no site publicado e comparar; confirmar se o bloqueio é só a publicação desatualizada ou outra checagem (chave de criptografia, origem pública).
2. Corrigir apenas o que a etapa 1 comprovar (sem mexer na Meta, NFS-e, imóveis ou outros segredos) e publicar o site.
3. Testar: clicar em "Autorizar Google" (Cordial) no site publicado e confirmar que abre a tela de consentimento do Google com o endereço de retorno `https://cordialgestao.com/api/public/ads-oauth/callback`.
4. Você conclui o login com a conta Google dona dos anúncios; depois eu confiro a conexão salva e as contas anunciantes listadas. Repetir para Morar.

## Aviso importante (limite real do Google)
- O login Google (etapas 1–4) funciona só com Client ID e Secret.
- Para puxar campanhas e métricas, o Google exige em toda leitura da API um "Developer Token" da sua conta administradora do Google Ads. Conforme seu pedido, não vou solicitá-lo nem simulá-lo; sem ele, a autorização conclui, mas a leitura de dados vai retornar recusa do Google. Quando quiser, decidimos juntos como seguir.

## Detalhes técnicos
- Erro vem de `adsConfig("google")` em `ads.functions.ts` (`not_configured`).
- Sem migrações; possível correção limitada a republicação ou ajuste pontual comprovado.
