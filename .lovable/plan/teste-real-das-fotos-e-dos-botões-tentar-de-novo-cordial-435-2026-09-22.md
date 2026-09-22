# Teste real das fotos e dos botões "Tentar de novo" (Cordial 4355160 / Morar 4355161)

Só no imóvel de teste autorizado. Nenhum outro imóvel é tocado.

## 1. Trocar uma foto (não a capa)
- Escolher a foto da posição 3 e trocá-la por uma nova imagem de teste, pelo fluxo normal de substituição do Gestão (com marca d'água).
- Esperado nos dois sites: continuam 7 fotos, a nova na posição 3, a antiga sai só depois que a nova é confirmada, a capa não muda e não aparece foto duplicada.

## 2. Reordenar duas fotos
- Inverter as posições 4 e 5 no Gestão.
- Esperado: a galeria é refeita só a partir da posição 4, com a mesma quantidade, a ordem nova e uma capa só. As fotos do começo não são tocadas.

## 3. Botões "Tentar de novo"
- Com tudo confirmado, apertar "Tentar cadastro de novo" e "Tentar fotos de novo" nos dois sites.
- Esperado: a tela avisa que não há nada pendente e nenhum envio é agendado.

## Quando parar
O teste é interrompido na hora, sem novas tentativas, se aparecer foto duplicada, foto sem código no site, galeria menor ou capa errada. Nesse caso eu trago os códigos das fotos para você decidir.

## Final
- A galeria fica na versão testada: foto nova na posição 3 e a ordem invertida volta ao original.
- Relatório de antes e depois de cada item da auditoria, com o que foi visto nos dois sites.
- Publicação ao final.

## Detalhes técnicos
- Upload por `media.functions.ts` (substituição) e reordenação por `reorder_property_images`. O worker `property-media-worker` é disparado com `WORKER_HOOK_SECRET`.
- Leitura só por GET em `/imovel/{codigo}/imagem/lista`, com espaço entre as chamadas por causa do limite da Morar (20/min).
- Conferência com `galleryMatchesExactly` e `media_rebuild_state`.
