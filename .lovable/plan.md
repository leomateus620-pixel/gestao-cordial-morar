# Fotos do site iguais às do Gestão (quantidade, ordem e capa)

## O que encontrei no 1381 (só leitura, 23/09 03:21 UTC)
- O Gestão tem 7 fotos prontas.
- **Cordial:** só as 3 primeiras foram enviadas. As outras 4 estão paradas em "pendente", e a galeria está marcada "reconstruindo".
- **Morar:** só a capa foi enviada. As outras 6 estão paradas em "pendente", e a leitura do site está marcada "não confiável".
- **Envios dados como "concluídos" sem estar:** as tarefas de fotos aparecem como concluídas, mas as fotos continuam pendentes.
- **Não é caso isolado:** hoje, nos dois sites, 33 anúncios têm a leitura travada como "não confiável", 5 estão com a ordem errada, 2 têm duas capas e 2 estão "reconstruindo". Há ainda 24 fotos com envio incerto.
- **Fotos antigas:** os anúncios com fotos antigas que nunca foram conferidas nem entram nessa conta. Por isso podem estar incompletos no site sem aparecer em lista nenhuma.

## Correção definitiva: "alinhar galeria" por imóvel e por site
Para cada imóvel, e separadamente para Cordial e Morar:
1. **Ler o site:** buscar a lista de fotos, a ordem e a capa, e conferir o total na ficha do anúncio.
2. **Comparar com o Gestão:** usar o código de cada foto no site, não o nome do arquivo.
3. **Enviar só o que falta:** mandar apenas as fotos que não estão no site, feitas a partir do original, com a marca-d'água certa. Foto com envio incerto só é reenviada depois que a leitura provar que ela não entrou.
4. **Arrumar a ordem e a capa** para ficarem iguais às do Gestão.
5. **Tirar do site só as fotos que o próprio Gestão enviou e que você apagou.** Fotos que não conseguirmos identificar ficam no site e entram numa lista para você decidir.
6. **Conferir de novo o site.** Só então o anúncio fica "igual ao Gestão"; se não bater, fica marcado com o motivo.

Regras:
- **Tarefas em andamento:** uma tarefa de fotos não pode mais terminar como "concluída" enquanto houver foto pendente. Ela continua, de forma gradual, até o site bater.
- **Leitura não confiável:** o anúncio tenta de novo sozinho, em horários espaçados, em vez de ficar travado para sempre.
- **Imóveis com fotos antigas:** entram também, mas um imóvel por vez, com limite de envios por site. Nada é feito em massa, e só é enviado o que realmente falta.
- **Nunca:** apagar anúncio, criar anúncio duplicado ou mudar o cadastro. Também não se reenviam fotos que já estão no site.
- **Botão "Alinhar fotos com o site"** na tela do imóvel, para você pedir na hora.
- **Imóvel 1384:** fica de fora até você liberar.

## Ordem de execução
1. **Uma lista, sem enviar nada:** mostrar, para cada anúncio, quantas fotos há no Gestão e no site, se a ordem e a capa estão certas e quantas foram enviadas por nós.
2. **Começar pelo 1381**, nos dois sites, e conferir abrindo os anúncios.
3. **Seguir com os demais da lista**, um por vez, com limite de envios por site.
4. **Relatório** com o antes e o depois de cada imóvel.

## Detalhes técnicos
- **Serviço de alinhamento:** `reconcileGallery(propertyId, provider)` em image-pipeline.server.ts. Ele reaproveita a leitura com prova do total, os vínculos `external_image_id` e as tarefas com reserva exclusiva e prazo, que já existem.
- **Fim da tarefa:** o `media_sync` só termina como `succeeded` quando a leitura final confirma que a quantidade, a ordem e a capa batem com as do Gestão; se não bater, a tarefa é reagendada.
- **Leitura não confiável:** o `remote_read_unreliable` ganha uma nova tentativa com intervalo crescente, puxada pelo cron de mídia que já existe.
- **Fotos antigas:** o alinhamento de um imóvel as tira da lista de análise (`legacy_review`) uma por uma, e só depois que o site for conferido.
- **Banco:** um ajuste de banco novo, só com acréscimos: estado `gallery_aligned_at` e uma fila de alinhamento com limite por site.
- **Testes:** falta de foto, ordem trocada, duas capas, envio incerto, leitura cortada e falha em um site sem travar o outro.
