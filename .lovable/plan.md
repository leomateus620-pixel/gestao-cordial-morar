# Fotos do Gestão iguais no site (recentes: 1377 a 1381 e 1384/3383)

## O que encontrei
- **1377, 1378, 1379 e 1380 (Cordial e Morar):** o Gestão registra todas as fotos como "enviadas", mas nenhuma delas tem o código que o site devolve quando recebe uma foto. Essas marcações são de 17 e 18/09, de uma versão antiga que marcava "enviada" sem prova. Por isso o sistema acha que está tudo certo e nunca reenvia. É a causa principal.
- **1381:** Cordial 3 de 7 e Morar 1 de 7 com código; o resto ficou parado. A correção de ontem, que envia o que falta, ainda não foi publicada.
- **1384 / 3383:** Morar tem as 17 fotos com código. Cordial tem 7 com código, 8 com envio incerto e 1 com erro. Nesse imóvel também aparece um erro de ajuste de banco que falta ("desired_availability").
- **Limite do site:** alguns envios falharam por passar de 20 pedidos por minuto e não foram retomados direito.

## Correção definitiva (vale também para os próximos imóveis)
1. **"Enviada" só com prova:** uma foto só conta como enviada se o site devolveu o código dela. Sem código, ela volta para a fila. Nenhuma tarefa termina como "concluída" enquanto faltar foto, ordem ou capa.
2. **Envio completo e em ordem:** o sistema envia as fotos que faltam na ordem do Gestão e depois confirma a ordem e a capa, que é a primeira foto do Gestão. Não depende de conferir o site. (É a correção de ontem, publicada junto.)
3. **Respeitar o limite do site:** no máximo 20 pedidos por minuto em cada site. Ao bater o limite, o sistema espera e continua sozinho, sem marcar erro nem parar.
4. **Retomada automática:** a cada 30 minutos, o sistema procura imóveis alterados nos últimos 30 dias que tenham foto sem código, ordem pendente ou capa pendente, e retoma o envio. Pega poucos imóveis por vez, nunca em massa. Cordial e Morar ficam separados.
5. **Envio incerto sem duplicar:** quando o site não responde se recebeu a foto, o sistema consulta uma única vez a lista de fotos daquele anúncio, só lendo, para saber se ela entrou. Se entrou, guarda o código. Se não entrou, envia de novo. Assim o envio nunca fica travado e não cria foto repetida.
6. **Ajuste de banco que falta:** aplicar o campo "desired_availability", sem apagar nada.

## Correção dos imóveis citados (um por vez, cada site separado)
Para 1377, 1378, 1379, 1380, 1381 e 1384 (Cordial e Morar):
- Consultar uma vez as fotos que estão hoje no anúncio no site, só lendo.
- **Retirar do site as fotos daquele anúncio que não têm código no Gestão** e enviar todas as fotos do Gestão na ordem certa, com a capa certa. Sem isso, as fotos que já estão lá ficariam repetidas.
- Na Morar do 3383, que já tem as 17 fotos com código, só conferir a ordem e a capa.
- Antes de retirar qualquer foto, mostrar a você a lista do que sai e do que entra em cada anúncio.

Nunca: apagar anúncio, criar anúncio novo, mexer no cadastro, proprietário, corretor ou códigos, nem reenviar as fotos antigas de outros imóveis.

Aprovar este plano autoriza liberar o 1384 e retirar do site as fotos sem código **somente nesses 6 imóveis**.

## Detalhes técnicos
- `media-sync.server.ts`: um `synced` sem `external_image_id` passa a contar como `pending`; o job só fica `succeeded` quando todas as fotos ativas têm id e a ordem e a capa foram aceitas.
- Correção pontual, só nesses 6 imóveis e sem ser em massa: as linhas `property_image_provider_publications` com `status='synced'` e `external_image_id is null` passam para `pending`.
- Controle de ritmo por provedor, com base em `provider_rate_events`. Um 429 ou a mensagem "Limite de requisições" vira `retry`, com espera de 60 segundos, e não `error`.
- Cron a cada 30 minutos (48 vezes por dia), limitado a 5 imóveis por site em cada rodada. A rodada termina rápido quando não há nada a fazer.
- `delivery_unknown`: um GET da lista de fotos do anúncio, comparando pelo código devolvido e pelo nome do arquivo que enviamos.
- Migração aditiva da coluna `property_provider_publications.desired_availability`, conferindo antes qual migração a define.
- Depois: publicar e conferir imóvel por imóvel se a quantidade, a ordem e a capa com código batem com o Gestão.
