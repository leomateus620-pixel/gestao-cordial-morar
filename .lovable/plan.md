# Reordenar fotos com exclusão pendente (imóvel 1384 Cordial)

## Confirmado nos dados
- Imóvel 1384 Cordial / 3383 Morar = ID interno `49d0d34e-a71b-4dc5-85b1-4d3f4886d2ac` (o mesmo imóvel real atingido hoje).
- 17 fotos ativas + 6 aguardando exclusão nos sites = 23 no banco.
- `reorder_property_images` compara a lista enviada com **todas** as fotos do imóvel. A tela envia 17 e o banco conta 23, daí "Lista de fotos incompleta para este imóvel". O erro nasce no Gestão, antes de qualquer envio ao Imobi.
- `property_images_normalize` também numera e escolhe a capa entre todas as fotos, inclusive as pendentes. Uma foto pendente pode ficar na posição 0 e virar capa.

## O que muda
1. **Nova migração (só acrescenta, não apaga nada):** substitui as duas funções.
   - `reorder_property_images`: valida e reordena só as fotos ativas (`pending_remote_delete = false`). Continua recusando:
     - IDs repetidos;
     - foto de outro imóvel;
     - foto pendente de exclusão;
     - lista que omite alguma foto ativa.
   - As fotos pendentes ficam fora da numeração e sempre com `is_cover = false`.
   - Recebe opcionalmente `_expected_gallery_revision`. Se a galeria mudou desde que a tela carregou, responde com o erro distinto `galeria_desatualizada`, sem gravar nada.
   - `property_images_normalize`: numera 0..N-1 e escolhe a capa só entre as fotos ativas. As pendentes ficam depois delas e nunca voltam a ser capa.
2. **Servidor (`media.functions.ts`):** reordenar, definir capa e substituir passam a revisão da galeria. Diante de `galeria_desatualizada`, devolvem a lista atual.
3. **Tela da galeria:** nesse caso, recarrega as fotos e mostra o aviso "A galeria mudou enquanto você organizava. A lista foi atualizada; repita a ordenação."
4. **Os registros pendentes não são apagados** e a validação continua. Os workers de exclusão seguem usando esses registros normalmente.

## Testes
- **Automáticos (novos):**
  - Montam o cenário "17 ativas + 1 pendente" e conferem:
    - a lista das 17 é aceita;
    - a lista com a pendente é recusada;
    - a lista que omite uma ativa é recusada;
    - IDs repetidos são recusados;
    - foto de outro imóvel é recusada;
    - a pendente nunca vira capa.
  - Revisão antiga dá "galeria desatualizada".
  - Substituir e depois reordenar antes da exclusão remota terminar.
- **Real, somente no imóvel de teste autorizado** (Cordial 4355160 / Morar 4355161), depois que a galeria dele voltar completa:
  - excluir ou substituir uma foto publicada;
  - reordenar as restantes antes da exclusão remota terminar;
  - conferir Cordial e Morar separadamente: quantidade, ordem, capa, nenhuma duplicata, e a foto antiga só sai depois da confirmação.
- No imóvel 1384 não faço nenhuma escrita manual. Só confiro, depois de publicar, que reordenar volta a funcionar ali.

## Detalhes técnicos
- Trava por imóvel (`pg_advisory_xact_lock`) mantida nas duas funções.
- A revisão da galeria usa `properties.gallery_revision`. A comparação acontece dentro da mesma transação, sob a trava.
- Os tipos do banco são regenerados após a migração, e só então ajusto a chamada no servidor.
- A mudança é publicada ao final.
