# Estado real das duas APIs (teste executado agora)

Chamadas reais feitas neste momento contra as duas contas:

## Cordial — LIBERADA (mudou desde o último teste)

- Status da conta: HTTP 200, `statusConta: true`
- Cidades: HTTP 200 — 5.597 itens
- Tipos de imóvel: HTTP 200 — 310 itens
- Características: HTTP 200 — 30 itens

O pacote de API da Cordial está ativo. Não há mais o erro "Você não tem o pacote da API no seu plano".

## Morar — BLOQUEADA

- Status da conta: HTTP 401 — "Token inválido."

O token da conta Morar continua rejeitado. Precisa ser regerado no painel da ImobiBrasil da Morar e atualizado aqui.

## Próximos passos propostos

1. Cordial (pode rodar já):
   - Carregar e cachear os catálogos (cidades, bairros, tipos, finalidades, características) e revisar o mapeamento com os dados do Gestão Cordial.
   - Bateria completa com um imóvel de teste: publicar, reprocessar (idempotência), atualizar dados, enviar/reordenar imagens, despublicar, reconciliar — com evidências de cada etapa e limpeza do registro remoto ao final.
   - Testes de resiliência: token inválido, falha temporária, execução concorrente do worker, erro definitivo com reprocessamento.
2. Morar (depende de você):
   - Regerar o token no painel da conta Morar; eu reabro o formulário seguro para atualizar o segredo e repito exatamente a mesma bateria.

## Observações técnicas

- Os caminhos de catálogo em uso (`/cidade/lista`, `/imovel/tipo/lista`, `/imovel/caracteristica/lista`) respondem corretamente na Cordial; a listagem é paginada (20 por página), então a carga precisa percorrer todas as páginas.
- Nenhum token é exibido em logs, respostas ou na interface.
