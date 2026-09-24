# Imóvel 1386: fotos que não chegaram à Cordial

## O que o sistema mostra (verificado)
- Morar: 14 fotos confirmadas, 1 com envio incerto (o site não devolveu o código da foto).
- Cordial (anúncio #4359659): **0 de 17**. A **primeira foto** ficou com "envio incerto" e, por isso, as outras 16 **nem foram tentadas**.
- A regra "não reenviar foto com envio incerto" (feita para evitar fotos repetidas) acabou travando a galeria inteira: uma foto incerta impede as demais.
- Houve também dúvida na criação do anúncio Cordial (o site demorou a confirmar) e o site ainda mostra o anúncio como "venda / consulte" em vez de locação, o que deixa a publicação como "parcial".
- A tarefa de fotos da Cordial estava marcada para 14:26 e ainda não tinha rodado de novo.

## Causa provável (a confirmar no passo 1)
A primeira foto foi enviada durante o momento em que a criação do anúncio ainda não estava confirmada. O site aceitou (ou não) sem devolver o código; o sistema marcou "incerto" e parou tudo, esperando uma confirmação que só é feita por leitura — que para a Cordial está voltando vazia.

## O que vou fazer
1. **Confirmar a causa** lendo os registros da tarefa de fotos da Cordial (sem enviar nada) e explicar no relatório onde parou.
2. **Uma foto incerta não trava mais as outras**: as fotos seguras (nunca enviadas) passam a ser enviadas normalmente; só a incerta fica aguardando conferência.
3. **Resolver a foto incerta com segurança**: uma leitura da galeria da Cordial; se a foto não aparece lá após o prazo de conferência, ela é reenviada uma única vez (sem risco de duplicar). Se aparece, é registrada como enviada.
4. **Fotos só depois do anúncio confirmado**: enquanto a criação do anúncio estiver em dúvida, nenhuma foto é enviada — evita repetir este caso em imóveis novos.
5. **Tarefa atrasada**: garantir que tarefas de fotos vencidas voltem a rodar (sem depender da tela aberta).
6. **Finalidade no site**: reenviar à Cordial somente o campo de finalidade/valor (locação, R$ 3.500), alteração mínima, sem tocar proprietário, corretor, códigos ou outros campos.
7. **Executar para o 1386** e confirmar com leitura final: 17 fotos na Cordial, capa e ordem do Gestão; completar a foto que falta no Morar pelo mesmo caminho.
8. Testes automáticos para: foto incerta não bloquear as demais; nenhuma foto antes do anúncio confirmado; reenvio único da incerta.
9. Publicar.

## Seguranças mantidas
Nada é apagado nos sites nem no Gestão; sem pedir novo upload; limite de envios por site respeitado; uma tarefa por imóvel/site.

## Detalhes técnicos
- `media-sync.server.ts`: `delivery_unknown` passa a ser por imagem (não gate da galeria); imagens `pending` seguem o plano; incerta resolvida por leitura `/imovel/{id}/imagens` após janela (ex. 10 min) → `synced` ou reenvio único com marcador de tentativa.
- Gate em `sync.server.ts`: `media_sync` adia enquanto `create_ambiguous_at` sem `external_property_id` confirmado.
- Verificar claim de jobs `retry` vencidos (`property_sync_claim_jobs`) para o caso 14:26.
- Envio parcial da finalidade via `/imovel/alterar` com apenas os campos divergentes.
