# Teste real no imóvel de teste (Cordial 4355160 / Morar 4355161)

Só o imóvel de teste autorizado. Nenhum outro anúncio é tocado. Nenhum imóvel ou cadastro é excluído nos sites.

## Roteiro
1. **Leitura inicial**: guardar como estão hoje nos dois sites os dados, as fotos (códigos, ordem, capa) e a visibilidade.
2. **Editar um campo**: mudar a descrição no Gestão e conferir, lendo os dois sites, que só esse campo mudou.
3. **Limpar um campo**: apagar o campo "local da chave" e conferir que ficou vazio nos dois sites.
4. **Trocar uma foto**: substituir uma foto que não é a capa. A nova foto deve entrar na mesma posição e a antiga só deve sair depois de a nova ser confirmada.
5. **Reordenar**: trocar a ordem de duas fotos. A galeria só conta como concluída quando a quantidade, as fotos, a ordem e a capa batem nos dois sites.
6. **Tentar de novo**: usar os botões "Tentar cadastro de novo" e "Tentar fotos de novo". Com tudo confirmado, a tela deve dizer que não há nada a refazer.
7. **Voltar ao original**: restaurar a descrição e o local da chave. As fotos ficam na versão testada, sem duplicatas.

## Critérios de parada
- Se aparecer uma foto duplicada, uma foto sem código ou um campo apagado sem ter sido pedido, o teste para. Nada é removido e eu te mostro o que aconteceu.

## Entrega
- Relatório com o antes e o depois de cada ponto da auditoria e o resultado de cada passo nos dois sites.
- Publicação da nova versão se todos os passos passarem.

## Detalhes técnicos
- Imóvel 95c61ecf-3031-4f90-91c3-ac7aef742907. Leituras por GET /imovel/dados e /imagem/lista. Escritas só pelo fluxo normal (save_revision_enqueue_v2 + workers).
- Conferências em property_sync_jobs (checkpoint, partial, superseded_by) e property_images (verification.matched_by).
