# Códigos GC-… nos sites: trocar pelos códigos reais Cordial/Morar

## O que está acontecendo (verificado no banco)

Os imóveis dos anexos aparecem no Imobi com identificações como `GC-FA20F995B643` porque, na hora de publicar, o sistema não encontrou o código daquela imobiliária e usou uma referência técnica gerada a partir do identificador interno do imóvel.

São 8 publicações (de 826) nessa situação, todas do mesmo padrão:

- Imóvel tem **só código Cordial** e foi publicado também na **Morar** (ex.: 1308, 1329, 957, 471) → sem código Morar, saiu `GC-…`.
- Imóvel tem **só código Morar** e foi publicado também na **Cordial** (ex.: 3195, 3238) → sem código Cordial, saiu `GC-…`.
- Dois imóveis ficaram com o próprio `GC-…` **gravado no campo do código Morar** (ex.: `GC-4FA470A0E907`), contaminando o cadastro.

Ou seja: o problema não é o site, é o imóvel ter sido publicado numa imobiliária sem código gerado para ela.

## Correção

1. **Nunca mais publicar sem código real**: antes de enviar ao site, se faltar o código daquela imobiliária, o sistema reserva um número da sequência correta (mesma reserva já usada no cadastro) e grava no imóvel. A referência `GC-…` deixa de ser usada como código visível.
2. **Limpar a contaminação**: apagar os valores `GC-…` que foram gravados nos campos de código Cordial/Morar e impedir, na gravação, qualquer código que comece com `GC-`.
3. **Corrigir os 8 casos existentes**: gerar o código faltante de cada imóvel (Cordial ou Morar), atualizar a referência da publicação e reenviar aos sites, para que a listagem passe a mostrar o número de controle.
4. **Sem quebrar o fluxo atual**: nada muda em fotos, descrição, endereço, links públicos ou nos imóveis que já estão com código correto.

## Detalhes técnicos

- `src/lib/imobibrasil/sync.server.ts` (`processJob` / `ensurePublication`): quando `providerExternalCode` volta nulo e ainda não há `external_property_id`, chamar `reserve_provider_code` para o provedor do job, persistir em `properties.codigo_cordial` / `codigo_morar` e usar esse valor como `external_reference`. `buildExternalReference` fica apenas como último recurso interno quando a reserva falhar (log/erro classificado, sem travar a fila).
- `src/lib/imoveis/imoveis.functions.ts`: validar na escrita que `codigoCordial`/`codigoMorar` não aceitam valores no formato `GC-…` (normalizar para nulo).
- Correção de dados (run_sql): limpar `codigo_morar` nos 2 registros contaminados; para os 8 casos, reservar e gravar o código faltante e atualizar `external_reference` da publicação correspondente.
- Reenfileirar `property_sync_jobs` (`action = update`) para os imóveis afetados e conferir no retorno da API que `referencia` passou a ser o código numérico.
- Testes: caso em `serializers.test.ts`/novo teste cobrindo "publicação sem código da imobiliária recebe código reservado, nunca `GC-`".

## Validação

- Conferir no banco que nenhuma publicação ativa mantém `external_reference` começando com `GC-`.
- Conferir na listagem do Imobi (Cordial e Morar) que os imóveis dos anexos passam a exibir o código numérico.
- Rodar typecheck e os testes de serialização.
