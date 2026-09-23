# Enviar as fotos do Gestão aos sites na ordem certa (anúncios recentes com problema)

## O problema (exemplo 1381)
- **No Gestão:** 7 fotos prontas.
- **Cordial:** só 3 foram enviadas. As outras 4 ficaram paradas em "pendente".
- **Morar:** só a capa foi enviada. As outras 6 ficaram paradas em "pendente".
- **Por que parou:** a tarefa de fotos foi marcada como "concluída" sem ter enviado tudo. Além disso, o sistema ficava esperando conferir o site antes de continuar ("leitura não confiável") e, com isso, travava.

## Como vai funcionar
- **Sem ler o site:** o Gestão é quem manda. Ele já guarda quais fotos enviou para cada site e o código que o site devolveu para cada uma.
- **Para cada anúncio, em cada site:**
  1. Enviar só as fotos que ainda não foram enviadas, na ordem do Gestão.
  2. Enviar a ordem completa e marcar como capa a mesma foto do Gestão.
  3. Retirar do site só as fotos que você apagou no Gestão e que nós mesmos enviamos.
- **Tarefa concluída:** a tarefa só termina como "concluída" quando todas as fotos do anúncio estiverem enviadas e a ordem e a capa tiverem sido aceitas pelo site. Se faltar alguma, ela continua na próxima rodada.
- **"Leitura não confiável":** deixa de travar o envio.
- **Envio que falhou sem resposta clara:** a foto não é reenviada no automático, para não duplicar. Ela aparece para você decidir.
- **Cordial e Morar:** cada site tem a sua própria fila. Se um falhar, o outro continua.

## Quais anúncios (sem fazer em massa)
- **Só anúncios recentes** (alterados nos últimos 30 dias) que tenham foto pendente, ordem errada, duas capas ou estejam travados.
- **Antes de enviar:** eu mostro a lista com os códigos para você aprovar.
- **Ritmo:** um anúncio por vez, com limite de envios por site.
- **Começo pelo 1381**, nos dois sites. Você confere no site e eu sigo com os demais.
- **Ficam de fora:** o 1384 (até você liberar) e as fotos antigas nunca enviadas por este sistema.
- **Nunca:** apagar anúncio, criar anúncio novo ou mexer no cadastro.

## Detalhes técnicos
- **Fim da tarefa:** o `media_sync` só termina como `succeeded` quando todos os vínculos em `property_image_provider_publications` estão `synced` e a chamada de ordem/destaque retornou sucesso. Se faltar algum vínculo, a tarefa é reagendada.
- **Travas retiradas:** o envio deixa de depender de `remote_read_state` e de `media_status = remote_read_unreliable` para avançar.
- **Ordem e capa:** vêm de `position` e `is_cover` das fotos ativas, usando os `external_image_id` guardados.
- **Envio incerto:** os vínculos `delivery_unknown` são mantidos e não entram no reenvio automático.
- **Correção dos anúncios afetados:** uma função que enfileira `media_sync` só para os IDs aprovados, respeitando o limite de envios por site que já existe.
- **Testes:** foto faltando, ordem trocada, duas capas, falha em um site sem travar o outro, envio incerto que não reenvia e tarefa que não conclui antes da hora.
