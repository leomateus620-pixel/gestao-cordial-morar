# Print da API retornando o erro (evidência para o suporte ImobiBrasil)

O suporte pediu a resposta crua da API, não um resumo. A entrega será uma imagem (print) com a chamada real e a resposta completa do servidor, sem expor o token.

## O que será capturado

Para cada conta, uma execução ao vivo mostrando:

- data/hora da chamada (UTC e horário de Brasília)
- método e URL chamada (ex.: `GET https://.../api/v1/app/conta/status`)
- cabeçalho enviado (`token: ****`, mascarado)
- código de status HTTP retornado (ex.: `HTTP/1.1 401 Unauthorized`)
- cabeçalhos de resposta e o corpo JSON exatamente como o servidor devolveu
  (ex.: `{"status":false,"message":"Token inválido."}`)

## Entrega

1. Rodar as chamadas reais contra as duas contas (Cordial e Morar) em três endpoints: status da conta, listagem de tipos de imóvel e listagem de imóveis — assim o suporte vê que o erro não é de um endpoint isolado.
2. Gerar um print em imagem (PNG) do terminal com essas respostas, uma seção por conta, com o token mascarado.
3. Salvar o arquivo nos documentos do projeto e exibi-lo aqui no chat, pronto para encaminhar ao suporte.
4. Se alguma conta responder com sucesso no momento da captura, isso também aparece no print — a evidência reflete o estado real do momento.

## Observações técnicas

- Captura feita com `curl -i` (status + headers + corpo) e renderizada em imagem; nenhum dado é editado manualmente além do mascaramento do token.
- Nenhuma alteração no sistema: é apenas coleta de evidência.
