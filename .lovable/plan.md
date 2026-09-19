# Auditoria somente leitura — duplicação de fotos e ordem (19/09/2026)

Nenhuma alteração foi feita: apenas GET nas duas APIs e SELECT no banco.

## 1. Registros remotos por referência (GET /imovel/lista?referencia=)

| Provedor | Referência | Cópias | external_property_id |
|---|---|---|---|
| Cordial | 1381 | 1 | 4355160 |
| Cordial | 1373 | 1 | 4350931 |
| Cordial | 1374 | 1 | 4350953 |
| Morar | 3380 | 1 | 4355161 |
| Morar | 3372 | 1 | 4350932 |
| Morar | 3373 | 1 | 4350954 |

Buscas cruzadas (1381 na Morar, 3380 na Cordial etc.) retornaram zero.
A API não devolve status/data nesse endpoint.

**Não existe anúncio duplicado.** A duplicação é de FOTOS dentro de cada anúncio.

## 2. Fotos: local x site

| Anúncio | Fotos no Gestão | Fotos no site | Extras | Marcadas como destaque no site |
|---|---|---|---|---|
| Cordial 1381 / 4355160 | 7 | 7 | 0 | 2 |
| Morar 3380 / 4355161 | 7 | 7 | 0 | 2 |
| Cordial 1373 / 4350931 | 3 | 5 | +2 | 3 |
| Cordial 1374 / 4350953 | 10 | 11 | +1 | 2 |

Fotos extras identificadas (inseridas em 19/09, duplicando foto já existente):
- 4350931: `91781483` (09:28) e `91781572` (09:39) — a mesma foto nova enviada duas vezes.
- 4350953: `91781515` (09:35) sobre a série já inserida.

A foto aérea com marcações é a primeira inserida de cada par (a mais antiga
de 19/09); as posteriores são as cópias. A confirmação visual final precisa do
seu olhar, porque a API só devolve `codigoImagem`, `url` e `destaque` — sem
posição e sem data.

Observação importante: `property_image_provider_publications.external_image_id`
está NULO em todos os registros dos três imóveis. O Gestão hoje não guarda o
`codigoImagem` do site, então não consegue apontar sozinho qual cópia remota
corresponde a qual foto local.

## 3. Cruzamento local (property_provider_publications)

Todos os `external_property_id` locais batem com o site (4355160/4355161,
4350931/4350932, 4350953/4350954). `media_status`: `order_drift` no 1381/3380 e
`synced` nos demais — mesmo com cópias extras no site, porque a checagem por
quantidade só acusa quando o remoto excede o esperado no momento da leitura.

## 4. Como as cópias foram criadas (causa raiz)

1. `planGalleryDelivery` compara `content_hash` local com o hash registrado no
   último envio. A marca-d'água é aplicada de forma assíncrona: quando o
   `processed_checksum` muda DEPOIS do primeiro envio, a mesma foto deixa de
   "casar" e é enviada de novo.
2. A API não tem recurso de excluir nem substituir imagem — só listar e
   inserir. Logo todo reenvio vira uma cópia permanente no site.
3. O registro local é gravado com `upsert` por (foto, publicação), então o
   segundo envio sobrescreve o primeiro e a cópia remota fica órfã e invisível
   para o sistema.
4. Cada inserção envia `destaque` conforme a capa local, o que explica dois e
   até três "destaque" no mesmo anúncio.

Não houve publish repetido, update virando insert nem perda de
`external_property_id`: os jobs de `publish` são um por provedor e concluíram.

## 5. Fila de fotos inflada

O gatilho `property_images_bump_gallery_revision` roda por LINHA alterada.
Arrastar 10 fotos altera 10 linhas e soma ~10 na `gallery_revision` — por isso
1374 chegou a 64 e 1381 a 43. Cada versão nova gera um job `media_sync` por
site (a chave de idempotência inclui a versão), resultando em 15 jobs por
provedor no 1374 e 12 no 1381. Confirmado: esses jobs NÃO reenviam fotos já
sincronizadas — são quase todos inócuos, mas cada um gasta uma leitura do
limite de 20 requisições por minuto do site, atrasando os envios reais.

## 6. Ainda há risco de duplicar cadastro?

O caminho atual sempre procura a referência antes de criar e isso funcionou nos
testes. Porém a gravação de `external_property_id` só acontece DEPOIS do
`/imovel/inserir`: dois jobs cadastrais do mesmo imóvel/provedor em versões
diferentes, reivindicados no mesmo lote, ainda podem criar dois anúncios.
Não há trava por (imóvel, provedor) na fila.

## 7. Por que a ordem do site não muda ao reordenar

No site a ordem é a ordem de inserção das imagens e não existe recurso de
reposicionar nem de trocar o destaque. Reordenar no Gestão muda a capa do card
interno e a versão da galeria, mas o único jeito de mudar a ordem no site seria
reinserir as fotos — o que criaria cópias. O sistema hoje registra a divergência
(`order_drift`) em vez de duplicar. Comportamento correto, comunicação ruim.

---

# Correção estrutural proposta (mínima e segura)

Nada aqui é executado sem sua aprovação; nenhuma etapa altera proprietário,
corretor ou a pausa cadastral.

## A. Parar de criar novas cópias
1. Congelar a "impressão digital" da foto no primeiro envio bem-sucedido: só
   reenviar se a foto nunca foi entregue, nunca quando apenas o processamento
   local mudou. Reenvio por mudança de arquivo passa a exigir pedido explícito.
2. Bloquear o envio enquanto a marca-d'água não estiver concluída, para o hash
   não mudar depois da entrega.
3. Nunca sobrescrever o registro de um envio anterior: guardar o histórico de
   entregas por foto, para cada cópia remota ter dono conhecido.

## B. Enxergar e limpar o que já duplicou
4. Guardar o `codigoImagem` do site em cada entrega e, na leitura da lista,
   casar por URL/ordem para marcar as cópias órfãs.
5. Tela de conferência por imóvel: fotos do site x fotos do Gestão, apontando as
   cópias. Como a API não exclui imagem, a remoção das extras é manual no painel
   do site — a tela serve de roteiro e registra o que já foi limpo (mesmo modelo
   já usado na limpeza de pontos fortes).

## C. Fila sob controle
6. Tornar o gatilho de versão por operação, não por linha, para um arrasto
   gerar UMA versão.
7. Substituir jobs antigos da mesma dupla imóvel/site ainda pendentes ao
   enfileirar a versão nova, em vez de acumular.
8. Não gastar leitura do limite do site quando o plano não tem nada a enviar.

## D. Cadastro sem risco de anúncio duplicado
9. Trava por (imóvel, provedor) na fila cadastral: um job por vez.
10. Reservar o `external_property_id` antes da criação e confirmar por
    referência imediatamente depois.

## E. Clareza na tela
11. Mensagem explícita no organizador de fotos: a ordem e a capa valem no
    Gestão; no site a ordem é a de inserção e mudá-la exigiria reenviar as fotos.

## Detalhes técnicos
- Arquivos envolvidos: `src/lib/imoveis/gallery-plan.ts`,
  `src/lib/imobibrasil/media-sync.server.ts`, `src/lib/imobibrasil/sync.server.ts`,
  gatilho `property_images_bump_gallery_revision`, RPC
  `property_sync_claim_jobs`, tabela `property_image_provider_publications`
  (novas colunas `external_image_id` já existente + histórico), e a UI de fotos.
- Testes puros para o novo plano de galeria (não reenviar por mudança de hash,
  bloquear foto não processada, detectar cópia órfã) no padrão `node:test`.
- `imobi_update_sync_paused` permanece `true`; `media_sync` continua sem tocar
  `/imovel/alterar`.
