# Novo token da Morar: substituir, testar e validar

## 1. Trocar o segredo

- Remover o valor atual de `IMOBIBRASIL_MORAR_TOKEN`.
- Abrir o formulário seguro para você colar o novo token gerado no painel ImobiBrasil da Morar (o valor não passa pelo chat nem aparece em log).

## 2. Verificação imediata da conta

Chamadas reais contra a base da Morar, com o novo token:

- `account/status` — confirmar HTTP 200 e `statusConta: true`.
- `imovel/tipo/lista`, `cidade/lista`, `imovel/caracteristica/lista` — confirmar HTTP 200 e contagem de itens.

Se ainda retornar 401 "Token inválido.", paro aqui e apresento a resposta crua da API como evidência para o suporte.

## 3. Carga de catálogos da Morar

- Rodar a atualização de catálogos do destino Morar (cidades RS, bairros, tipos, finalidades, características) com paginação completa e cache no banco.
- Revisar o mapeamento entre os dados do Gestão Cordial e os códigos da Morar; listar campos sem correspondência.

## 4. Bateria ponta a ponta com um imóvel de teste

Mesma sequência já validada na Cordial:

1. Publicar e conferir o registro criado com a referência correta.
2. Reprocessar o mesmo envio (idempotência: nada duplicado).
3. Alterar valor/dormitórios/descrição e republicar, conferindo a atualização.
4. Enviar e reordenar imagens, conferindo capa e galeria.
5. Despublicar (`exibirImovel=nao`) e conferir a saída do site.
6. Reconciliar e confirmar que o status local reflete o estado remoto.
7. Remover o registro de teste do site ao final.

## 5. Resiliência e painel

- Confirmar retry/backoff, lock do worker e mensagem clara de erro por destino.
- Conferir o painel de saúde em Integrações mostrando as duas contas verdes.
- Entregar resumo com evidências de cada etapa.

## Observações técnicas

- Nenhuma mudança estrutural prevista: reaproveita `src/lib/imobibrasil/*`, a fila `property_sync_jobs` e o worker existente.
- Token nunca exposto em logs, respostas ou interface.
