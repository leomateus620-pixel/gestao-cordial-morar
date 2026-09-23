# Correção da regra de destinos + 060000/061000 + endereços + publicação

## 1. Nova regra para mudança de destinos (ajuste novo, o 032000 fica como está)
- **Ocultar/excluir** (destinos ficam vazios ou o imóvel entra em retirada): muda só a intenção de publicação e bloqueia envios de fotos incompatíveis. Nenhuma foto é marcada para refazer.
- **Troca de destinos** (Cordial→Morar, ambas→uma, uma→ambas): só entram as fotos daquele imóvel cuja marca-d'água realmente precisa mudar, e que não sejam antigas, não estejam aguardando exclusão e já tenham destino gravado. As fotos antigas continuam na lista delas, sem ir para a fila.
- **Refazer a marca sempre a partir do original**, nunca sobre a foto já marcada. Sem o original, ou sem prova de qual marca a foto tem: a foto fica bloqueada com motivo próprio ("original ausente" / "variante não comprovada"), não vai com a versão antiga e não conta como conferida.
- **Ritmo gradual:** a rotina de imagens já trabalha em lotes pequenos. Nada varre as 11.448 fotos antigas.
- **Desfazer:** guardo antes a regra atual para poder restaurar.

## 2. Testes desfeitos no fim (antes de aplicar e depois de aplicar)
- As mesmas 21 fotos antigas, ocultando o imóvel: 0 alteradas, 0 na fila.
- Cordial→Morar, ambas→uma e uma→ambas, com fotos novas e antigas misturadas: só as fotos novas que precisam de outra marca mudam; as antigas não.
- Original ausente: a foto fica bloqueada com motivo e não entra no envio.
- Foto aguardando exclusão: não muda e não volta para a galeria.
- Imóvel 1384 e anúncios reais ficam de fora. Se algum teste falhar, paro e mostro.

## 3. Ajuste 060000 sem as importações diárias, depois o 061000
- Guardo o estado atual e preparo o desfazimento. O 060000 entra como arquivo novo sem as duas rotinas diárias; o 061000 entra igual ao arquivo do projeto.
- Testes com os cinco perfis (visitante, corretor, secretaria, administração e sistema): ler, incluir, alterar e apagar fotos, lotes, lista de problemas de envio e funções novas. Se algum resultado for inesperado, paro.
- Refaço o teste de ocultar/excluir com fotos antigas depois de aplicar.

## 4. Anúncio novo
- Confiro e cubro com testes: cria o anúncio só nos sites escolhidos, com código e fila próprios de cada site; manda as fotos salvas com a ordem e a capa escolhidas. Resultado incerto: primeiro ler o site; sem cópias e sem "concluído" sem confirmação.

## 5. Endereço (só os dois imóveis já identificados)
- Confirmo os códigos internos e os vínculos com os sites. Guardo o texto original no histórico. Altero só número e complemento (270 / ap 103 Cancun; 380 / Residencial Ravena, Ap 504 - Bloco 01). A correção vai ao site pelo envio normal.

## 6. Publicar e acompanhar
- Publico a leitura com prova do total e confirmo o que está no ar comparando o código publicado com o do projeto; sem essa prova, não atribuo resultados à leitura nova.
- Por site, mostro a primeira tarefa confirmada e depois o estado dos imóveis 1381, 1373 e 1379 e dos pares Morar. Galeria igual só se batem quantidade, identidade das fotos, conteúdo verificável, ordem e capa. O 1384 só é observado.
- O relatório separa: tarefa rodando, efeito confirmado no site e galeria igual à do Gestão. Uploads com entrega incerta não são repetidos.

## Pendentes
- Ajuste 230002 (faltam os segredos) e importações diárias (falta a política seletiva por campo).

## Detalhes técnicos
- Nova migração substitui property_targets_mark_images_pending:
  - retorno antecipado quando NEW.publish_targets está vazio ou removal_state não é nulo;
  - UPDATE só onde desired_destination_hash IS NOT NULL, a imagem não está em property_image_legacy_review (status open) e NOT pending_remote_delete;
  - processed_storage_path é ignorado ao marcar pending;
  - sem original_storage_path: processing_status='blocked' com processing_error_code='original_ausente';
  - review_status do legado não é alterado.
- Worker de marca-d'água: confirmar que parte do original_storage_path. O enfileiramento de mídia não envia foto cuja destination_hash difere da desejada.
