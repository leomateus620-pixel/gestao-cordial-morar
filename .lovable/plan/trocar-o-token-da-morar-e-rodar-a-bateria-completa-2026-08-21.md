# Trocar o token da Morar e rodar a bateria completa

## 1. Apagar o segredo atual

Remover `IMOBIBRASIL_MORAR_TOKEN` do cofre de segredos, para não sobrar resíduo do valor antigo (que a API rejeita com "Token inválido.").

## 2. Receber o novo token com segurança

Abrir o formulário seguro de segredo para você colar o token completo, exatamente como está no Postman (Ctrl+A no campo do header, sem quebras). O valor não passa pelo chat nem aparece em log.

Depois de salvo, confirmo apenas medidas derivadas (comprimento, prefixo `$2y$10$`, 4 últimos caracteres, hash truncado) para provar que chegou íntegro — nunca o valor.

## 3. Verificação imediata

Chamadas reais do nosso servidor contra a base da Morar, com o novo valor:

- `GET /imovel/lista` (a mesma chamada do print do suporte) — esperado HTTP 200 com a contagem de imóveis
- `GET /account/status`, `/imovel/tipo/lista`, `/cidade/lista`, `/imovel/caracteristica/lista`

Se ainda vier 401, paro e entrego a resposta crua (URL, header mascarado, status, corpo) como evidência de que a diferença está do lado do provedor.

## 4. Catálogos da Morar

Com a conta liberada: carregar e cachear cidades (RS), bairros, tipos, finalidades e características com paginação completa, e revisar o mapeamento com os dados do Gestão Cordial, listando campos sem correspondência.

## 5. Bateria ponta a ponta com um imóvel de teste

Mesma sequência já validada na Cordial:

1. Publicar e conferir a referência criada
2. Reprocessar o mesmo envio (idempotência — nada duplicado)
3. Alterar valor/dormitórios/descrição e republicar
4. Enviar e reordenar imagens (capa + galeria)
5. Despublicar (`exibirImovel=nao`)
6. Reconciliar e conferir o status local
7. Remover o registro de teste do site

## 6. Painel e resiliência

Conferir o card de saúde em Integrações com as duas contas verdes, e revalidar retry/backoff, lock do worker e mensagem de erro por destino. Ao final, resumo com as evidências de cada etapa.

## Observações técnicas

- Sem mudança estrutural: reaproveita `src/lib/imobibrasil/*`, a fila `property_sync_jobs` e o worker existente.
- Se a verificação mostrar que o endpoint de saúde atual não é liberado para a Morar, troco o endpoint de checagem para `/imovel/lista`.
- Token nunca exposto em log, resposta, imagem ou interface.
