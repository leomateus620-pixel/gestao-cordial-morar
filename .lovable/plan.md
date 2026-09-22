# Edição confiável de todos os campos, sem apagar o que não foi alterado

## Situação confirmada agora no código

- `serializeProperty` monta **um payload completo** e a alteração é obtida depois por comparação (`buildMinimalUpdate`). Campo vazio, `0` e `false` são descartados pela função `assign`, então "limpar de propósito" e "não informado" chegam iguais ao site.
- `pontosFortesImovel` é o único campo enviado como `""` **sempre**, em qualquer alteração — inclusive quando o usuário mexeu apenas no preço.
- Vídeo, observação de valor, valores opcionais e demais textos nunca são limpos: sem conteúdo local, o campo é omitido e o site preserva o valor antigo.
- `resolveProviderCodes` escolhe **o primeiro nome parecido** do catálogo para corretor e proprietário. Homônimos são um risco real, e o que não casa é silenciosamente omitido.
- `syncCharacteristics` só insere associação; nada é removido quando a equipe tira uma característica.
- Confirmação após a escrita existe (`verifyRemote`), mas não compara campo por campo o que foi enviado.
- O contrato oficial (`/api/v1/doc/api.json`, dois domínios) tem os endpoints necessários: `POST /imovel/{codigoImovel}/caracteristica/excluir/{codigoCaracteristica}` (remove só a associação) e `/pessoa/lista`, `/pessoa/inserir`, `/pessoa/alterar` para pessoas. Existe também `/imovel/caracteristica/excluir/{codigo}`, que apaga a característica do catálogo global — **este nunca será usado**.

## O que será feito

### 1. Dois contratos separados
- **Inclusão**: valida o cadastro necessário e monta o corpo completo (como hoje, com validação mais rígida).
- **Alteração**: recebe um **conjunto explícito de mudanças** (campo por campo), não uma cópia do formulário. O formulário passa a informar quais campos o usuário realmente tocou.

### 2. Três estados por campo
Novo modelo `intocado` / `definido` / `limpeza intencional`:
- intocado → não vai no corpo (o site preserva);
- definido → vai com o valor, inclusive `0` e `false` legítimos;
- limpeza → vai vazio de propósito (vídeo, tour, observação de valor, IPTU, condomínio, descrição, pontos fortes, etc.).

### 3. Descrição e pontos fortes como uma operação só
- Fim do `pontosFortesImovel: ""` automático.
- A divisão da descrição longa (transbordo para pontos fortes) é recalculada **apenas quando descrição ou pontos fortes entram na alteração**, e os dois campos viajam juntos, coerentes entre si.

### 4. Validação antes de escrever
Finalidade, tipo, cidade, áreas e suas unidades, quantidades, valores, booleanos e enums conferidos contra o contrato e o catálogo do destino. Sem correspondência de código obrigatório, **nada é adivinhado**: a alteração fica pendente no Gestão com mensagem acionável ("tipo 'Sobrado geminado' não existe no catálogo da Morar — escolha o equivalente") e o trabalho volta à fila em vez de falhar em silêncio.

### 5. Pessoas vinculadas por ID confirmado
- Remoção da escolha automática pelo primeiro nome coincidente.
- Vínculo só é usado quando há **ID confirmado da conta correspondente** (código da Cordial nunca na Morar).
- Homônimo ou correspondência múltipla → vínculo fica "desconhecido", nunca enviado.
- Campo mascarado na leitura do site continua classificado como desconhecido (nunca vira vazio/zero).
- Alteração explícita de pessoa: resolve na conta ou cadastra pela rota de pessoas do próprio site e **só depois** grava o vínculo do imóvel. Editar o cadastro da pessoa e editar o imóvel passam a ser operações distintas.

### 6. Características por diferença
Comparação entre o conjunto desejado e o confirmado: insere o que falta, mantém o que já existe, remove o que saiu usando o endpoint que desassocia daquele imóvel. Falha de permissão, validação ou limite marca a etapa como **incompleta** (não como sucesso).

### 7. Conferência após cada escrita
Leitura confirmatória comparando ID remoto, referência e cada campo alterado. Resposta sem referência, ou JSON não vazio, deixam de valer como prova. Campo que o site não devolve fica com estado explícito "não verificável".

### 8. Retirada, arquivamento e exclusão separados
Retirada do site envia só o patch necessário; arquivamento é local; exclusão definitiva é ação própria e **nunca** efeito colateral de uma edição.

### 9. Informações internas
Observações internas, dados de pessoas e informações de negociação continuam fora de qualquer texto público e preservados nos campos internos do Gestão.

## Testes
Comportamento, por destino (Cordial e Morar separadamente): alteração isolada de preço; limpeza explícita de vídeo/observação; `0` e `false` válidos; preservação de proprietário/corretor/usuário adicional; homônimos; remoção de característica; resposta remota divergente; descrição longa com transbordo.

## Entrega
- Mapeamento dos campos suportados (nome no Gestão → campo da API → semântica de limpeza → verificável ou não).
- Limitações comprovadas na conta.
- Evidência, em edição controlada nos dois destinos, de que apenas o campo alterado mudou.

## Detalhes técnicos

- Novo `src/lib/imobibrasil/field-state.ts` (estado tri-valorado, puro) e `src/lib/imobibrasil/update-contract.ts` (`buildInsertPayload` / `buildUpdatePatch`), mantendo `payload-diff.ts` como rede de segurança contra o último snapshot confirmado.
- `serializers.ts`: `assign` deixa de descartar `0`/`false`; textos públicos passam a devolver estado, não `undefined`; `pontosFortesImovel` sai do caminho incondicional.
- `catalogs.server.ts`: `resolveProviderCodes` deixa de resolver corretor/proprietário por nome; passa a exigir mapa confirmado por provedor e devolve ambiguidade; novo módulo `people.server.ts` para `/pessoa/*`.
- `sync.server.ts`: `syncCharacteristics` vira diferença (inserir/remover) com registro do conjunto confirmado em `property_provider_publications`; nova etapa de conferência campo a campo; erro de mapeamento vira estado retomável com mensagem acionável.
- Formulários (`PropertyForm.tsx`, rotas de novo/editar) passam a enviar o conjunto de campos tocados junto da revisão esperada, preservando a idempotência e o controle de concorrência da etapa anterior.
- Migração aditiva: colunas de conjunto de características confirmado, estado de verificação por campo e vínculos confirmados por provedor. Nenhum dado existente é apagado.
