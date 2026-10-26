# Preparar o aplicativo Meta "Gestão Cordial" (2739298586487785) para publicação

## Situação atual (o que já foi verificado)
- Webhook leadgen funcionando em `https://cordialgestao.com/api/public/meta/leadgen` (verificação, assinatura do app e da Página feitas antes).
- Não existe página pública de privacidade do Gestão. A página de privacidade do site Cordial (`/site/informacoes/privacidade`) mostra "em preparação" quando não há texto cadastrado, então não serve para a Meta.
- E-mail institucional já usado no sistema: `atendimento@cordialgestao.com` (precisa da sua confirmação como canal de privacidade).

## Etapas
1. **Identidade**: nome proposto "Gestão Cordial" (sem a palavra Meta/Facebook, conforme regra). Ler no painel, pela conexão Meta, o nome da empresa vinculada e a situação da verificação empresarial. Não inventar CNPJ nem razão social: vão como campos a confirmar.
2. **Ícone**: gerar PNG 1024×1024 a partir do símbolo oficial (o mesmo do logo atual), centralizado, margem de cerca de 15%, fundo claro sólido. Entregar em Arquivos (`gestao-cordial-icone-1024.png`) e conferir dimensões.
3. **Página `/politica-de-privacidade`** pública, sem login, sem indexação bloqueada: responsável, contato, dados recebidos dos formulários de anúncio (nome, telefone, e-mail e respostas do formulário), métricas de anúncios (sem dados pessoais), uso no CRM (atendimento), acesso restrito à equipe por perfil, compartilhamentos reais (sites ImobiBrasil não recebem leads; serviços de hospedagem do sistema), armazenamento no sistema, retenção e direitos. Onde não houver prazo ou base legal definida, o texto diz isso de forma neutra e eu marco como "a confirmar" para você.
4. **Página `/exclusao-de-dados`** pública: como pedir (e-mail confirmado), quais dados informar para localizar o registro, conferência de identidade antes de apagar, execução manual pela administração. Sem rota que apague dados automaticamente; nada ligado ao webhook ou ao retorno de login.
5. **Publicar** e conferir por HTTPS, sem login, as duas URLs (status 200 e texto certo).
6. **Permissões**: confirmar pela conexão Meta (`/me/permissions` e dados do app) o que o app usa: `leads_retrieval`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`, `ads_read` e `business_management`. Como só usa ativos da própria Cordial (Página e conta de anúncios da empresa, pessoas com papel no app), o acesso padrão costuma bastar e não precisa de análise; acesso avançado/App Review só se houver ativos de terceiros. Confirmo o que o painel realmente exige e não peço permissão sem uso.
7. **Material de análise** (só se o painel exigir): justificativa por permissão, passo a passo para o avaliador e roteiro de vídeo. Sem dados fictícios e sem senha de produção; acesso de teste só pelo canal da Meta.
8. **Painel**: não tenho como preencher o painel Meta Developers (configurações básicas não são editáveis pela API de forma segura). Entrego tabela pronta para copiar e o caminho exato: Configurações do app → Básico → nome, e-mail, categoria ("Negócios e páginas" ou a mais próxima que aparecer), domínio `cordialgestao.com`, URLs, ícone → Salvar → Publicar.
9. **Validação final**: repetir o teste do webhook e listar só pendências reais, separando: preparado, salvo no painel, enviado para análise, aprovado, modo Live e integração funcionando.

## Confirmações que preciso de você
- E-mail de contato e de privacidade: `atendimento@cordialgestao.com` está certo?
- Razão social e CNPJ responsáveis (Cordial, Morar ou ambas).
- Prazo de guarda dos leads, se já existir regra interna.

## Riscos
- Publicar leva junto as outras mudanças pendentes da prévia.
- A publicação ainda pode ser bloqueada pelos 10 achados críticos de segurança.
