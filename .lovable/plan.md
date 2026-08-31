# Códigos Cordial e Morar: corrigir a numeração

## O que está acontecendo (verificado no banco)

O gerador escolhe o "próximo código" pegando o maior número que encontra em quatro lugares diferentes. Dois deles estão contaminados:

1. **Campo de código antigo com o ID interno do site Morar.** Cinco imóveis importados em 27/08 guardam no campo legado `codigo` números como `3899550`, `3899542`, `3899133`, `3827823`, `2870037` — esses são identificadores internos do site, não códigos de anúncio. O código real desses imóveis é 3090, 3089, 3088 (os outros dois nem têm código numérico). Resultado: o gerador acredita que o último código Morar é 3.899.550 e passou a entregar 3899551, 3899552, 3899553… quando a sequência real da Morar está em **3335**.
2. **Reservas expiradas continuam ocupando o número.** Cordial tem 1340, 1341, 1343 e 1347 reservados em testes, expirados e nunca aproveitados; o próximo sairia 1349 mesmo com o último código realmente usado sendo 1339.

Cordial não sofre do problema 1 (maior código real = 1339, coerente com o site). Morar sofre dos dois.

## Solução

1. **Limpar os dados contaminados**: nos cinco imóveis, mover o código verdadeiro para o campo da Morar (3090, 3089, 3088) e limpar o campo legado `codigo` onde ele contém o ID interno do site em vez de um código de anúncio. Os dois sem código numérico ficam sem código Morar até serem republicados.
2. **Deixar de olhar para o campo legado**: o gerador passa a considerar apenas o código por imobiliária (`codigo_cordial` / `codigo_morar`), a referência publicada de cada provedor e as reservas ativas.
3. **Reaproveitar números vagos** (opção escolhida): em vez de "maior + 1", o gerador entrega o **menor número livre** a partir de um piso por imobiliária, ignorando reservas expiradas/liberadas. Na prática o próximo código Cordial volta a ser 1340 e o próximo Morar 3336.
4. **Continuar a checagem no site**: se o número escolhido já existir no site da imobiliária, ele é marcado como ocupado e o gerador segue para o próximo livre — comportamento que já existe e é mantido.

## Detalhes técnicos

**Migração 1 — saneamento dos dados**
- `UPDATE properties SET codigo_morar = codigo, codigo = NULL` para os três registros cujo `external_reference` da publicação Morar é numérico e igual ao código real (3090/3089/3088), e `codigo = NULL` nos dois com referência `GC-…`.
- Nenhuma alteração em códigos Cordial (todos coerentes).

**Migração 2 — `public.reserve_provider_code`**
- Remover o termo que lê `properties.codigo`.
- Trocar o cálculo `GREATEST(...) + 1` por uma varredura do menor inteiro livre: montar o conjunto ocupado a partir de `codigo_cordial`/`codigo_morar`, `property_provider_publications.external_reference` numérico e `provider_code_reservations` com status em (`reserved`, `committed`, `taken_remote`), e escolher o primeiro número ausente a partir do piso do provedor (`generate_series` com `LEFT JOIN` / `NOT EXISTS`, sob o `pg_advisory_xact_lock` já existente).
- Piso configurável por provedor (padrão: 1 para Cordial e Morar), preservando `release_expired_provider_codes()` no início e o retorno atual `(code, reservation_id, expires_at)`.
- Sem mudança de assinatura, então `codes.functions.ts` e `usePropertyCode` seguem intactos.

**Validação**
- Antes/depois: conferir que `reserve_provider_code('cordial')` devolve 1340 e `reserve_provider_code('morar')` devolve 3336, e liberar essas reservas de teste.
- Conferir que nenhum código já publicado (500 Cordial / 304 Morar) é reemitido.
- Rodar typecheck e um cadastro real no wizard com os dois destinos.
