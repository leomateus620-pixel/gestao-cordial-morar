# Número do endereço limitado a 15 caracteres + campo Complemento

## Resumo
O 1400/3399 está travado porque o Número tem "355,Bl-1/Apt: 201" (17 caracteres) e o site aceita no máximo 15. O formulário não tem campo Complemento, então a equipe coloca bloco/apto no Número. Esta entrega cria o campo Complemento, barra o problema no cadastro e no servidor, impede a tentativa inútil no site e deixa a mensagem clara no card de publicação. Nenhum dado existente é alterado.

Conferido agora (só leitura): `complemento` já existe no banco, é importado (`import-normalizers.ts`), enviado (`serializers.ts`, `update-contract.ts`), mas não está no mapa de campos de `imoveis.functions.ts` (só `numero`, linha 26) nem no `PropertyForm.tsx` (só Número, linha ~801).

## Arquivos
- Novo: `src/lib/imoveis/address-rules.ts` e `address-rules.test.ts`
- `src/components/imoveis/PropertyForm.tsx` (passo Endereço)
- `src/types/property.ts` (`complemento` em `PropertyWriteInput`)
- `src/lib/imoveis/imoveis.functions.ts` (mapa de campos, leitura do detalhe, create/update)
- `src/lib/imoveis/registration.functions.ts` (finalize) e, se preciso, `registration-rules.ts`
- `src/routes/_app.imoveis.$imovelId.index.tsx` (exibir Complemento)
- `src/lib/imobibrasil/sync.server.ts` (pré-checagem antes de inserir/alterar)
- Novo: `src/lib/imobibrasil/address-precheck.ts` + teste (função pura usada pelo sync, testável sem banco)
- `src/lib/imoveis/publish.functions.ts` e `src/components/imoveis/PropertyPublishPanel.tsx`
- Novo: `src/lib/imoveis/publish-messages.ts` + teste (tradução do erro e regra de "Próxima execução")
- `package.json` (novos testes no script `test`)

## A. Regra única (`address-rules.ts`, sem dependência de servidor)
- `IMOBI_NUMERO_MAX = 15`.
- `validateAddressNumber(numero)`: vazio/nulo = ok (obrigatoriedade continua com as regras atuais); conta caracteres depois de `trim`; acima de 15 = erro "Número do endereço com N caracteres (máximo 15 nos sites). Bloco, apartamento e fundos vão em Complemento."
- `suggestAddressSplit(numero)`: reconhece no início "S/N"/"SN"/"SEM" ou dígitos com letra opcional ("1234A"); o resto, sem separadores soltos (`, - / :` e espaços repetidos), vira complemento. Retorna `null` se não houver número reconhecível. Nunca trunca, nunca aplica sozinho.
- `mergeComplemento(sugerido, existente)`: se já houver complemento, junta "sugerido, existente" sem duplicar texto igual.
- `looksLikeComplement(numero)`: detecta bloco/bl/ap/apt/apto/fundos/lote/casa/sala/loja mesmo com até 15 caracteres, para oferecer a sugestão (sem bloquear).

## B. Cadastro e edição
- Campo "Complemento" ao lado do Número, ligado a `complemento` no mapa de campos, tipos, `getPropertyDetail` e detalhe do imóvel.
- Número com `maxLength={15}`, dica "Só o número do prédio/casa (ex.: 355 ou S/N). Bloco, apartamento e fundos vão em Complemento." e erro inline.
- Colar texto: o `maxLength` corta no navegador, então o campo usa validação própria em vez de cortar: o valor colado é aceito no campo, o erro aparece e surge o botão "Mover para Complemento" com a sugestão visível. Só aplica ao clicar.
- Avançar/salvar fica bloqueado enquanto passar de 15. Bloco/apto com até 15 só mostra a sugestão.
- Abrir imóvel antigo não altera nada; o complemento existente é carregado e preservado ao salvar (campo só vai no update se mudou, como os demais).

## C. Servidor
- `createImovelCore` e `finalizePropertyRegistration`: recusam número acima de 15 com erro de campo claro, sem truncar.
- `updateImovelCore`: valida só se o `numero` enviado for diferente do gravado; editar outros campos em registro antigo continua funcionando (o bloqueio fica na etapa D).

## D. Pré-checagem no envio aos sites
- Antes de `/imovel/inserir` e antes da alteração, se o payload tiver número acima de 15: falha local, categoria `validation`, mensagem de D com o caminho "Editar imóvel → Endereço → Número".
- Sem chamada HTTP, sem pegar trava de criação (a checagem roda antes da aquisição) e sem tocar `create_state`, `create_absent_checks`, `create_ambiguous_at`, `external_property_id`. Não cria estado ambíguo.
- Consulta por referência, `awaiting_create_reconcile`, 3 conferências e a classificação do HTTP 400 da Imobi continuam iguais.
- Com até 15 caracteres, o payload sai exatamente igual ao atual.

## E. Card "Publicação nos sites"
- Mensagem de número (local ou texto da Imobi "O número do endereço deve conter no máximo 15 caracteres") vira a mensagem amigável de D, com botão "Editar imóvel".
- `media_sync` aguardando o anúncio existir (sem `external_property_id`): mostra "Fotos aguardando a criação do anúncio".
- "Próxima execução" só aparece se o horário for futuro.

## Riscos e prevenção
- Envio diferente sem querer: teste de snapshot do payload para números de até 15.
- Trava de criação presa ou duplicidade: pré-checagem antes da trava; teste partindo de `awaiting_create_reconcile` com 3 conferências confirma estado intacto.
- Bloquear edição de imóvel antigo: update só valida número alterado; teste específico.
- Apagar complemento: só enviado quando muda; teste no mapa de campos.
- Sugestão errada: só aparece como proposta, nunca corta nem aplica sozinha.
- Mexer em NFS-e/fila: nenhum arquivo de NFS-e nem do worker além de D é tocado.

## Testes
- `address-rules`: "355,Bl-1/Apt: 201" → 355 + "Bl-1/Apt: 201"; "380 bloco 2 406" → 380 + "bloco 2 406"; "1146    -  102" → 1146 + "102"; "494/Apt:1002" → 494 + "Apt:1002"; "185  ap 302" → 185 + "ap 302"; "1356 fundos" → 1356 + "fundos"; "S/N"; "SEM"; vazio/nulo; exatamente 15 (ok) e 16 (erro); "1234A".
- Pré-checagem: bloqueia acima de 15 sem chamada HTTP e sem mudar estado de criação (também em `awaiting_create_reconcile` com 3 conferências); até 15 mantém payload idêntico e complemento viaja.
- Servidor: create/finalize/update recusam acima de 15; update de outro campo em registro antigo passa.
- Card: tradução da mensagem Imobi, "Fotos aguardando a criação do anúncio", horário passado oculto.
- Suíte completa (`bun run test`) + typecheck, com foco em serializers, update-contract, payload-diff, duplicate-guard, reference-lookup, create-failure, queue-policy e registration-rules. Nada que escreva no banco.

## Roteiro para você validar depois
Cadastro novo → Número com bloco/apto é barrado → "Mover para Complemento" → salvar → publicar Cordial e Morar → anúncio criado uma vez, complemento correto, fotos enviadas → editar outro campo continua funcionando.

## Restrições confirmadas
- Não publico o app; não toco na migration nem em nada de NFS-e.
- Não pauso a sincronização; fila só muda no item D.
- Sem UPDATE em imóveis, sem normalização retroativa, sem migration. 1400/3399 e 1372/3371 ficam para depois, um a um, com sua aprovação.
- Não disparo publicação nem enfileiro nada durante implementação ou testes.
- Proteção contra anúncio duplicado sem alteração.
