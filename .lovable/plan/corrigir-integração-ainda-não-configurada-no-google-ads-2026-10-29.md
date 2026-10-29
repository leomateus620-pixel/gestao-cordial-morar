# Corrigir "Integração ainda não configurada" no Google Ads

## Causa encontrada
O Client ID e o Client Secret do Google estão salvos corretamente. O que falta é outra chave interna do sistema: a **chave de proteção das credenciais**. Ela serve para guardar de forma criptografada o acesso que o Google devolve depois do login. Antes de abrir o Google, o sistema confere se essa chave existe. Como ela nunca foi criada, o sistema para e mostra a mensagem genérica "Integração ainda não configurada".

A Meta não passa por esse bloqueio porque usa outro tipo de acesso, que dispensa essa chave.

## Etapas
1. Gerar automaticamente essa chave interna. Ela é aleatória e fica guardada no cofre do sistema: você não precisa digitar nada, e nenhuma chave existente é alterada.
2. Confirmar na prévia que "Autorizar Google" passa a abrir a tela de login do Google, com o endereço de retorno `https://cordialgestao.com/api/public/ads-oauth/callback`.
3. Publicar o site para que `cordialgestao.com` passe a usar a nova chave.
4. Depois que você fizer o login Google na Cordial, eu confiro se a conexão ficou salva e quais contas anunciantes aparecem. Depois repetimos o processo na Morar.

## Lembrete
Para puxar campanhas e números, o Google ainda vai exigir o Developer Token da sua conta administradora. Conforme seu pedido, ele não será solicitado agora.

## Detalhes técnicos
- `startAdOAuth` chama `encryptCredential("configuration-probe")`, e essa função exige `ADS_CREDENTIAL_ENCRYPTION_KEY` com 32 bytes em base64. Hoje esse segredo não existe, e a falta dele gera o código `not_configured`.
- A chave será criada com o gerador de segredos, com 43 caracteres alfanuméricos, que decodificam para 32 bytes. Antes de publicar, confirmo o tamanho sem mostrar o valor. Se o formato não servir, ajusto só a leitura da chave para derivar 32 bytes, com teste.
- Sem migrações e sem mudanças na Meta.
