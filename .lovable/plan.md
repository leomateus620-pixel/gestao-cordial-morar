# Plano — Ativar a conexão MCP no ChatGPT

## Diagnóstico
O agente do ChatGPT entrou no app pelo navegador e procurou uma "autorização MCP" nas telas de Configurações/Integrações. Essa opção não existe nas telas — e não deve existir. A autorização MCP acontece no fluxo do próprio ChatGPT: ao adicionar o conector, ele abre a tela de login do Gestão Cordial e depois a tela "Autorizar acesso" (já implementada em `/.lovable/oauth/consent`).

O motivo de ele não ter encontrado nada: o servidor MCP (rota `/mcp` + metadados OAuth) existe no código, mas **o app ainda não foi republicado** desde que as ferramentas foram criadas. A versão no ar não tem o endpoint, então o ChatGPT não consegue conectar.

## Passos

1. **Republicar o app** (botão Publish → Update). Isso coloca no ar o endpoint `https://gestao-cordial-morar.lovable.app/mcp` e a tela de autorização.
2. **No ChatGPT**: configurar o conector MCP apontando para `https://gestao-cordial-morar.lovable.app/mcp` (em Configurações → Conectores/Apps → criar conector MCP, ou pelo modo desenvolvedor, conforme a versão do ChatGPT).
3. Ao conectar, o ChatGPT abre o login do Gestão Cordial → entrar com a conta → tela "Autorizar acesso" → clicar **Autorizar**.
4. Pronto: as 8 ferramentas somente leitura (buscas, resumos e insights) ficam disponíveis no ChatGPT.

## O que NÃO será feito
- Nenhuma tela nova de "autorização MCP" dentro do app — não é necessária.
- Nenhuma alteração de código, dados, NFS-e, fotos ou sync.
- Nada de escrita: as ferramentas continuam somente leitura.

## Validação
- Após publicar, conferir que `/.well-known/oauth-protected-resource` responde e que o ChatGPT completa a conexão e lista as ferramentas.
