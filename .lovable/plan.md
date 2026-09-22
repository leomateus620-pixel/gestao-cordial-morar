# Correções da auditoria de 22/09 — integração Cordial/Morar

Pontos da auditoria que conferi no código atual: a inclusão começa com a lista de campos enviados vazia; o snapshot apaga a chave não confirmada; as fotos ainda recebem ID pela ordem de inserção (`ordem_de_insercao`); a leitura de páginas aceita formato desconhecido como lista vazia; a verificação automática do repositório chama `bunx tsgo`, que não existe no registro de pacotes; o envio não atualiza a referência usada pela importação. Os demais pontos (concorrência entre revisões, merge não transacional, botão "tentar de novo" sem efeito) vêm da auditoria. Cada um deles só será corrigido depois de reproduzido em teste.

Nada será testado em imóvel real de cliente. Validação real só no imóvel de teste (Cordial 4355160 / Morar 4355161).

## Etapa 1 — Confirmação honesta e limpeza que não se perde
- A inclusão passa a listar todos os campos que tentou gravar e a conferir cada um deles na leitura. O que diverge fica pendente.
- O snapshot mantém a última confirmação conhecida. Tentativas que não se confirmam ficam guardadas em uma lista separada de "intenções pendentes", que registra também as limpezas.
- O patch mínimo envia a limpeza pendente mesmo quando a chave não existe no snapshot.
- As reconciliações não marcam mais o anúncio como publicado só porque ele existe; as pendências são preservadas. Existência, visibilidade, tentativa e confirmação ficam separadas.
- `last_synced_revision` só avança quando não há nenhuma pendência.

## Etapa 2 — Uma operação por imóvel e site
- O claim passa a dar uma trava por imóvel e site: dois workers não processam o mesmo destino ao mesmo tempo.
- Cada job guarda a revisão de origem. Um job superado por uma revisão nova é descartado ou absorvido; a união dos campos também considera jobs `failed` cuja intenção ainda não foi entregue.
- Toda gravação na publicação depois de uma chamada ao site fica condicionada à posse e à revisão, incluindo o catch genérico.

## Etapa 3 — Fotos: identidade e retomada
- Fim da atribuição de ID por posição. O ID só é vinculado quando surge exatamente uma foto nova e o conteúdo confere. Nos outros casos, a entrega fica marcada como desconhecida.
- Um plano persistido de reconstrução registra, para cada foto, a etapa (antes/depois) e o resultado. A retomada parte desse plano.
- Depois de um erro na reinserção, a galeria é relida e reconciliada antes de qualquer novo envio.
- A mídia só é confirmada quando a quantidade, as fotos, a ordem e a capa conferem. Galeria vazia ou menor nunca conta como concluída.

## Etapa 4 — Importação transacional e entre contas
- Nova RPC transacional aplica o merge, incrementa a revisão, grava os conflitos e as duas referências (entrada e saída) de uma só vez.
- O envio confirmado passa a atualizar também a referência usada pela importação.
- `conflict_count` passa a mostrar o total de conflitos pendentes.
- Cordial x Morar: antes de aplicar um campo compartilhado, as leituras atuais das duas contas são comparadas. Se divergirem, o valor do Gestão é mantido e o conflito é registrado. O resultado não depende mais da ordem de importação.

## Etapa 5 — Tentar de novo, leitura de páginas e números
- Um job parcial não termina mais como `succeeded` genérico: o componente pendente fica registrado.
- "Tentar de novo" cria ou consolida a operação do que falta. Quando não houver nada a agendar, a tela diz isso.
- Formato desconhecido de resposta passa a ser leitura inconclusiva. Página cheia sem metadados não encerra a leitura.
- Comparação numérica por tipo de campo: dinheiro em centavos, área com a própria precisão, código como texto.

## Etapa 6 — Verificação automática
- Corrigir a verificação automática do repositório para usar a ferramenta de tipos já instalada no projeto. Tipos e testes rodam na mesma revisão.

## Testes
Testes de comportamento para cada caso da auditoria:
- operação aceita com resposta perdida;
- duas revisões concorrentes;
- limpeza recusada;
- falha ao registrar conflito depois do merge;
- galeria vazia ou incompleta;
- importações Cordial/Morar nas duas ordens;
- parser malformado;
- 1.001 x 1.004;
- botão "tentar de novo" sem job.

## Entrega
Relatório "antes/depois" por item da auditoria, com as migrações aplicadas e as evidências no imóvel de teste nos dois sites.

## Detalhes técnicos
- Arquivos: sync.server.ts, confirm-snapshot.ts, update-contract.ts, reconcile.server.ts, media-sync.server.ts, gallery-rebuild.ts, remote-changes.server.ts, cross-account.ts, read-parsers.ts, list-all.ts, number-compare.ts, publish.functions.ts, image-retry.server.ts e .github/workflows/ci.yml.
- Migrações só aditivas: coluna `pending_intents` jsonb, `origin_revision` no job, índice de trava por imóvel e site, RPC de claim com trava e RPC `property_remote_merge`. As migrações já aplicadas não serão alteradas.
