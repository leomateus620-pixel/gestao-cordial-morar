# Imóvel 1384 — anúncio escondido na Cordial

## O que encontrei (conferido agora, só leitura)
- Cordial (anúncio 4357320): o site está com **"exibir imóvel" desligado**. Por isso o link do anúncio volta para a página inicial. Na Morar (4357321) está ligado, e o anúncio aparece.
- No Gestão o imóvel está marcado para aparecer e não foi arquivado. Ninguém pediu para esconder.
- Fotos na Cordial: só **2 de 17** estão no site. As outras 15 pararam com "limite de pedidos do site atingido" e não foram reenviadas. As 6 fotos antigas ainda esperam exclusão.
- O envio de fotos da Cordial está na 3ª de 6 tentativas e continua parado em "exclusão pendente". Se passar de 6, desiste sozinho.
- Na Morar: 12 fotos no site, 11 confirmadas, 5 com o mesmo erro de limite.

Causa provável: quando a galeria da Cordial ficou quase vazia (bug antigo corrigido hoje), o site desligou a exibição do anúncio sozinho. O sistema não notou porque o botão "Tentar de novo" e a conferência não comparam essa opção.

## O que vou fazer
1. **Religar a exibição na Cordial**: uma alteração mínima só com "exibir imóvel = sim" no anúncio 4357320. Nada mais muda: proprietário, corretor, códigos, preço e texto ficam iguais.
2. **Completar as fotos**: as fotos paradas por limite de pedidos voltam para a fila (Cordial e Morar), sem reenviar as que já estão no site e sem duplicar. A exclusão das 6 antigas continua só depois de confirmada.
3. **Não desistir no meio**: fotos paradas por limite de pedidos não gastam as tentativas. Elas esperam o tempo que o site pede e retomam.
4. **Detectar anúncio escondido**: a conferência de rotina passa a comparar "exibir imóvel" com o Gestão. Se o site esconder o anúncio sem ninguém pedir, o painel mostra "Oculto no site (não solicitado)" e religa automaticamente. Isso não vale quando alguém usou "Ocultar do site".
5. **Conferir no fim**: abrir o link público nos dois sites e contar fotos, ordem e capa em cada um.

## Detalhes técnicos
- Visibilidade: `sync.server.ts`, ramo `wantsVisibilityFix` que já existe (força `exibirImovel` em changedFields), acionado pelo reconcile quando `/imovel/dados` devolve `exibirImovel=false` e `properties.exibir_imovel=true` e `removal_state` é nulo.
- Fotos: `property_image_provider_publications` com status `error` e categoria de limite viram `pending` (migração só aditiva ou via fluxo normal `queueMediaSync`). Em `media-sync.server.ts`, erro de limite não conta tentativa e usa Retry-After.
- Testes novos: anúncio escondido pelo site é religado; ocultado de propósito não é; fotos com erro de limite retomam sem duplicar.
- Publicar ao final.
