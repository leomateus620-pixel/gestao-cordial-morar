# Diagnóstico profundo das duas APIs (Cordial e Morar)

Objetivo: descobrir exatamente por que a conta Morar responde 401 enquanto a Cordial responde 200, corrigir o que for corrigível do nosso lado e entregar evidências brutas (PNG + TXT) das duas contas.

## 1. Bateria completa por conta

Para cada conta (Cordial e Morar), chamadas reais, uma a uma, com `curl -i` (status + headers + corpo):

- `conta/status`
- `imovel/tipo/lista`
- `imovel/finalidade/lista`
- `cidade/lista` (UF = RS)
- `bairro/lista`
- `imovel/caracteristica/lista`
- `imovel/lista` (com e sem filtro de referência)
- `imovel/dados/{codigo}` (quando houver algum imóvel listado)

Cada chamada registra: data/hora (UTC e Brasília), método, URL, headers enviados (token mascarado), status HTTP, headers de resposta e corpo JSON íntegro.

## 2. Matriz de variações de autenticação (só na Morar)

Como a Cordial funciona com o mesmo formato de token, a Morar será testada em variações controladas para isolar a causa:

- header `token` (padrão atual) vs. `Token` vs. `Authorization: Bearer`
- token com e sem espaços/quebras (o cliente já normaliza)
- base URL com e sem `www`, http vs https, com e sem barra final
- `Content-Type` JSON vs form-urlencoded
- comparação byte a byte do formato do token (prefixo, comprimento, caracteres) entre as duas contas, sem revelar o valor

Resultado esperado: ou encontramos uma variação que autentica (e aí corrigimos o cliente), ou fica provado que o bloqueio é do lado do provedor.

## 3. Verificação de rede e do host

- Resolução DNS e certificado TLS dos dois domínios
- Confirmar que o domínio da Morar aponta para a mesma plataforma ImobiBrasil
- Verificar se o endpoint da API existe na Morar (404 vs 401 distingue "pacote de API desativado" de "token errado")

## 4. Correções do nosso lado

Aplicar o que a matriz indicar. Se nada do nosso lado for a causa, o código fica como está (já normaliza espaços) e a conclusão é registrada. Testes automatizados da integração rodam ao final.

## 5. Entregáveis

- `imobibrasil-diagnostico-completo.txt` — log bruto de todas as chamadas das duas contas, token mascarado
- `imobibrasil-diagnostico-completo.png` — print em imagem do terminal com as respostas, uma seção por conta, pronto para enviar ao suporte
- Resumo no chat com o veredito: causa provável, o que foi corrigido e o que depende do suporte/painel da Morar

## Observações técnicas

- Nenhum token aparece em log, arquivo, imagem ou resposta — sempre mascarado.
- Se alguma variação autenticar na Morar, a correspondente é aplicada em `src/lib/imobibrasil/client.server.ts`/`providers.ts` e a bateria de publicação (catálogos, publicar, imagens, despublicar, reconciliar) roda na sequência.
