# Google Ads: análise do erro depois da autorização

## O que aconteceu (comprovado)
- **A autorização Google deu certo.** Às 02:31 UTC o sistema salvou a conexão da Cordial com acesso protegido e com a permissão de leitura de anúncios (`adwords`).
- Na prévia, a página de Integrações abre normalmente e mostra **"Autorização registrada. Nenhuma conta selecionada"**, com os botões "Consultar contas acessíveis" e "Autorizar novamente".
- A tela "Sistema temporariamente indisponível" apareceu na volta do Google, um minuto depois de eu pedir a publicação. A causa mais provável é que o site estava trocando de versão nesse momento e não conseguiu carregar seu perfil. Hoje a página publicada responde normalmente. Essa causa ainda não está confirmada; a etapa 1 serve para comprovar.

## O próximo bloqueio (real)
Para listar as contas e puxar campanhas, o sistema chama a API do Google Ads. Hoje essa chamada vai sem o "Developer Token", que o Google exige em toda leitura. Por isso, "Consultar contas acessíveis" deve ser recusado pelo Google.

## Etapas
1. Abrir `cordialgestao.com/integracoes?ads=autorizado` com a sua sessão e confirmar se a página carrega. Se a tela de erro voltar, capturar o erro exato e corrigir só a causa comprovada, com teste.
2. Clicar uma única vez em "Consultar contas acessíveis", só para leitura, e registrar a resposta exata do Google, sem mostrar credenciais.
3. Com essa resposta, você decide como seguir (pergunta abaixo). Nada será alterado nas contas de anúncio.

## Como seguir depois (sua decisão)
- **A) Developer Token próprio:** você pede o token na sua conta administradora do Google Ads (Ferramentas → Central de API), e eu passo a enviá-lo nas leituras. A aprovação do Google pode levar alguns dias.
- **B) Conector Google Ads da Lovable:** já tem acesso à API aprovado. Você entra com a conta Google dona dos anúncios e não precisa de token próprio. Exige ajustar a leitura de campanhas para passar por esse conector.

## Detalhes técnicos
- Linha salva: `ad_platform_connections` (google/cordial, status `error`, token de acesso e de renovação presentes, escopo adwords). O status `error` é o esperado até uma conta ser selecionada.
- `discoverGoogleAccounts` (`providers/google.server.ts`) chama `listAccessibleCustomers` só com `Authorization`, sem `developer-token`.
- Tela de erro: `SystemUnavailable` (falha ao carregar o perfil em `app-shell`/`_app` errorComponent).
