# Saneamento de fotos repetidas nos sites — 19/09/2026

Método: API oficial ImobiBrasil. A especificação viva (`/api/v1/doc/api.json`, idêntica nos
dois sites) documenta `POST /imovel/{codigoImovel}/imagem/excluir/{codigoImagem}`. Nenhum
endpoint de exclusão de imóvel foi chamado. Nenhum cadastro, preço, descrição, endereço,
pontos fortes, proprietário ou corretor foi alterado. `imobi_update_sync_paused` segue `true`.

Snapshot completo (antes/depois, sem tokens): `docs/saneamento-fotos-19-09-2026.json`.

## Confirmação de unicidade de cadastro

| Site | Referência | codigoImovel | Cadastros com a referência |
| --- | --- | --- | --- |
| Cordial | 1381 | 4355160 | 1 |
| Morar | 3380 | 4355161 | 1 |
| Cordial | 1373 | 4350931 | 1 |
| Morar | 3372 | 4350932 | 1 |
| Cordial | 1374 | 4350953 | 1 |
| Morar | 3373 | 4350954 | 1 |

## Fotos excluídas (duplicatas comprovadas por comparação de imagem, distância 0)

| Site | Imóvel | Excluída | Mantida (mesma foto) | Antes → depois |
| --- | --- | --- | --- | --- |
| Cordial | 4350953 (1374) | 91781673 | 91781517 | 11 → 10 |
| Morar | 4350954 (3373) | 91781532 | 91781529 | 11 → 10 |
| Cordial | 4350931 (1373) | 91781572 | 91781483 | 5 → 4 |

Cada exclusão foi seguida de `GET /imovel/{id}/imagem/lista`: a foto mantida continua
presente e a excluída desapareceu. A aérea demarcada (área/lote em amarelo) foi preservada
em todos os casos.

## Não saneado (fora da autorização / exige decisão)

1. **Fotos antigas órfãs** — presentes no site, sem par no Gestão (versão anterior do
   anúncio, mapa aéreo com áreas em vermelho): Cordial 1373 `91687037`, Morar 3372
   `91687059`, Cordial 1374 `91687408`, Morar 3373 `91687411`. Não são duplicatas de foto
   atual; mantidas.
2. **Múltiplos destaques** — a API só define destaque no momento da inserção; não existe
   endpoint para tirar/alterar destaque. Situação atual (2 destaques em cada):
   - 1381 `91776905` (aérea demarcada) + `91775914` (mesma aérea sem demarcação, foto local
     válida na posição 4);
   - 3380 `91776941` + `91775880`;
   - 1373 `91781483` + `91687037` (órfã);
   - 3372 `91781482` + `91687059` (órfã);
   - 1374 `91781515` (aérea demarcada) + `91687406` (foto no nível da rua, local válida);
   - 3373 `91781528` + `91687409`.
   Corrigir por API exigiria excluir e reinserir foto válida — não feito, conforme a regra
   de não excluir foto válida apenas para ajustar destaque.
3. **Cordial 1374 / Morar 3373**: a foto local da posição 4 nunca foi entregue aos sites.
