# Sumiço do proprietário vinculado nos imóveis (Cordial e Morar) — 10/09/2026

## Situação relatada

A equipe abriu imóveis nos painéis Cordial e Morar e o bloco **RESPONSÁVEL →
"Proprietário do Imóvel (não exibido)"** aparece vazio em todos os imóveis, dos
dois sites. Antes havia nome/celular/e-mail vinculados.

## O que foi apurado no Gestão (banco, 10/09/2026)

Imóveis ativos (`archived_at IS NULL`):

| origem | total | com nome | com telefone | com e-mail |
| --- | --- | --- | --- | --- |
| cordial_website | 469 | 1 | 1 | 0 |
| morar_api | 306 | 0 | 0 | 0 |
| cordial_api | 31 | 0 | 0 | 0 |
| gestao_cordial (cadastro manual) | 24 | 17 | 16 | 0 |

Conclusão: **o Gestão nunca guardou esses contatos** para os imóveis importados
(o importador nunca mapeou `proprietario_nome/telefone/email`; ver
`src/lib/imobibrasil/import-normalizers.ts`). Portanto o sumiço **não foi** um
apagamento no banco do Gestão e não existe cópia local para restaurar.
O dado sempre esteve apenas no cadastro do Imobi.

## Correlação encontrada

Entre 08/09/2026 e 09/09/2026 o Gestão enviou **535 alterações bem-sucedidas**
(`property_sync_jobs.action = 'update'`) para `POST /imovel/alterar/{codigo}`,
nos dois provedores — republicação em massa após a limpeza de "Pontos fortes".

No payload de alteração (`src/lib/imobibrasil/serializers.ts`), o campo
`codigoProprietario` é **omitido** sempre que o Gestão não tem nome do
proprietário — ou seja, em praticamente todos os imóveis.

Hipótese principal (a confirmar com o suporte): `/imovel/alterar` grava o
registro inteiro e **zera os campos omitidos**, incluindo o vínculo do
proprietário. Isso explica o sumiço simultâneo em Cordial e Morar.

Observação: `GET /imovel/dados/{codigo}` devolve `codigoProprietario: 0` mesmo
antes desse episódio (ver `docs/IMOBI-PROPRIETARIO-CONTATO.md`), então a
comprovação precisa ser feita **no painel** do Imobi, não pela API.

## Contenção aplicada em 10/09/2026

- 278 envios que ainda estavam na fila (`pending`/`retry`/`processing`) foram
  cancelados.
- Trava `app_settings.imobi_update_sync_paused = {"paused": true}`: o worker
  (`runSyncWorker`) cancela qualquer job de `update` enquanto ela estiver ligada.
  Publicar, despublicar e excluir continuam funcionando.

## Pedido ao suporte ImobiBrasil

1. Restaurar, a partir do backup, o vínculo de proprietário dos imóveis
   alterados entre 08/09/2026 e 09/09/2026 (lista em
   `imoveis-alterados-08-09-09-2026.csv`, 543 imóveis, com código do site).
2. Confirmar se `POST /imovel/alterar` zera campos omitidos no corpo — e, se
   sim, indicar como preservar `codigoProprietario`/`codigoCorretor` em
   alterações parciais.
3. Liberar o retorno de `codigoProprietario` em `GET /imovel/dados` para o token
   de integração, para o Gestão passar a guardar cópia própria do contato.

Enquanto 2 não for respondido, a trava de alterações permanece ligada.
