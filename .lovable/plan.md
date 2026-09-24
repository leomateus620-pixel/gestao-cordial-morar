# 1386: Locação na Cordial e fotos corretas

## O que foi confirmado agora
- No Gestão, o 1386 está **sem finalidade preenchida**. Por isso o sistema entende o anúncio como "venda" e a publicação aparece como "parcial".
- Cordial (#4359659): 0 de 17 fotos confirmadas, e 1 com envio incerto.
- Morar (#4359638): 14 de 17 confirmadas, e 1 com envio incerto.

## O que será feito (só no 1386)
1. **Finalidade = Locação** no cadastro do Gestão, sem mexer em valor, proprietário, corretor ou código.
2. **Envio mínimo à Cordial**: só a finalidade/tipo de negócio vai para o site. Os outros campos ficam como estão. O Morar só recebe o mesmo ajuste se também estiver como venda.
3. **Fotos na Cordial**: a foto incerta passa pela regra nova. Se a leitura mostrar que ela não está no site, é reenviada uma única vez. Depois o sistema envia as 17 fotos na ordem do Gestão, com a capa primeiro, e aguarda o limite do site entre os envios.
4. **Fotos no Morar**: as 3 que faltam são enviadas da mesma forma, sem repetir as 14 que já estão lá.
5. **Conferência final**: uma leitura de cada site confirma 17/17, a capa, a ordem e "Locação". Mostro o resultado a você.

## Garantias
- Nada é apagado nos sites nem no Gestão, e nenhum anúncio é recriado.
- Nenhuma foto é duplicada, e você não precisa enviar nenhuma foto de novo.
- Os outros imóveis da fila continuam andando.

## Detalhes técnicos
- Atualizar `properties.finalidade = 'locacao'` só para o id 8e71c147 (escrita autorizada por este pedido).
- Enfileirar `update` parcial para cordial e morar só com o campo de finalidade, depois `media_sync` com prioridade para o 1386.
- Verificar em `publish.functions`/mapeamento se finalidade nula deve bloquear a publicação em vez de assumir "venda". Adicionar esse bloqueio, com teste, para não se repetir.
