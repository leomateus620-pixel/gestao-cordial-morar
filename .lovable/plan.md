# Marca única Morar + Cordial em todas as fotos

Decisão do Ricardo: a marca combinada (Morar + Cordial) passa a ser a única aplicada, independente de o imóvel ir para o site da Cordial, da Morar ou dos dois. As marcas individuais deixam de ser usadas em qualquer upload.

## O que muda

- Toda foto nova recebe a marca combinada, sem depender do destino escolhido na etapa 6.
- A etapa 6 deixa de dizer "marca do destino" e passa a mostrar sempre "Morar + Cordial".
- Trocar o destino do imóvel (Cordial ↔ Morar ↔ ambos) não regenera mais as fotos, porque a marca é a mesma nos dois casos — menos reprocessamento e publicação mais rápida.
- Fotos já marcadas com a versão individual (Cordial só ou Morar só) são regeneradas automaticamente na próxima vez que entrarem na fila, para não sair foto com marca antiga.

## Detalhes técnicos

- `src/lib/imoveis/watermark-config.ts`: `variantForTargets` passa a retornar sempre `morar-cordial`; `destinationHash` deixa de variar por destino e passa a depender só da versão do template. Geometria usa sempre `widthRatioCombined`. Os tipos e os templates individuais continuam existindo (sem uso ativo), para não quebrar registros históricos.
- `src/lib/imoveis/image-pipeline.server.ts`: nenhuma mudança de lógica necessária — ele já deriva variante e hash da config. Com o hash estável, `enqueueImageJobs` só reenfileira imagens cujo hash antigo é diferente (exatamente as marcadas com variante individual).
- `src/components/imoveis/PropertyPhotosStep.tsx`: rótulo fixo "Morar + Cordial", sem cálculo a partir de `destinos`.
- `src/lib/imoveis/media.functions.ts`: `setPropertyPublishTargets` continua salvando o destino (necessário para a publicação), mas não dispara mais reprocessamento em massa.
- Publicação (`sync.server.ts`) segue enviando `processed_storage_path` — sem alteração.

## Verificação

Upload novo com destino só Cordial, só Morar e ambos deve produzir o mesmo arquivo com a marca combinada; troca de destino não deve marcar fotos como pendentes.
