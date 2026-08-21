# Morar: token válido no Postman, 401 aqui — investigar o que difere

O suporte provou que o token funciona: `GET https://www.imobiliariamorarimoveis.com.br/api/v1/app/imovel/lista` com o header `token` retornou HTTP 200 e 722 imóveis. Ou seja, a conta e o pacote de API estão ativos. Então a diferença está em o que o nosso servidor envia — não no token em si.

Duas hipóteses concretas, ambas verificáveis:

1. **Valor armazenado diferente do valor testado.** O token é um hash bcrypt (`$2y$10$...`) com `$`, `/` e `.`. Valores desse tipo são facilmente truncados/alterados ao passar por cópia, colagem parcial ou interpolação de variável. Se o segredo guardado aqui não for byte a byte igual ao do print, a API responde exatamente "Token inválido.".
2. **Endpoint de verificação diferente.** Nosso teste de saúde bate em `conta/status`. O print do suporte usa `imovel/lista`. É possível que a conta Morar tenha permissão no endpoint de imóveis e não no de status, e nós estejamos julgando a conta inteira por um endpoint que ela não libera.

## O que será feito

1. **Comparação segura do segredo**: imprimir apenas comprimento, prefixo (`$2y$10$`), sufixo de 4 caracteres e hash SHA-256 truncado do valor armazenado, e comparar com as mesmas medidas do trecho visível no print. Nenhum token exposto.
2. **Repetir exatamente a chamada do suporte** do nosso servidor: `GET /imovel/lista`, mesmo header, mesmo domínio, e registrar status + corpo cru.
3. **Rodar a bateria por endpoint** na Morar (`imovel/lista`, `imovel/tipo/lista`, `cidade/lista`, `conta/status`) para saber se o 401 é geral ou só em `conta/status`.
4. **Se o segredo estiver divergente**: abrir o formulário seguro para você colar novamente o token completo (exatamente como está no Postman, sem quebras) e repetir a bateria.
5. **Se a chamada idêntica passar**: trocar o endpoint de verificação de saúde da Morar para um que a conta libere, para o painel deixar de mostrar a conta como bloqueada indevidamente.
6. **Se a chamada idêntica falhar com o mesmo valor**: entregar a evidência crua (URL, header mascarado, status, corpo) mostrando que a diferença é do lado do provedor (ex.: restrição por IP/origem do servidor), o que é a próxima pergunta objetiva ao suporte.

## Observações técnicas

- Nenhuma mudança estrutural: reaproveita `src/lib/imobibrasil/client.server.ts` e `providers.ts`.
- O cliente hoje remove todos os espaços do token (`replace(/\s+/g, "")`), o que é seguro para bcrypt; isso será confirmado como não destrutivo no diagnóstico.
- Token nunca aparece em log, resposta, imagem ou interface — só medidas derivadas.
