# Fotos dos imóveis: correção estrutural do pipeline (Gestão ↔ Cordial ↔ Morar)

## O que a auditoria confirmou agora

Verificado no código e no banco, antes de qualquer alteração:

- A posição de cada foto é calculada como "maior posição + 1" no momento do registro, sem proteção contra envios simultâneos. Resultado: **21 imóveis com posições repetidas** e a tabela sem regra de unicidade (só um índice comum).
- O envio para os sites decide reenviar uma foto por status, conteúdo ou troca de capa. **Mudar apenas a ordem não é reconhecido como mudança**, então a ordem escolhida no Gestão pode nunca chegar ao site.
- O envio das fotos é feito 2 a 2 em paralelo, o que não garante ordem de chegada no site.
- No envio ao site, o arquivo vai com o **nome original** (ex.: `DJI_0765.JPG`) mesmo quando o conteúdo entregue foi convertido para JPEG — origem dos 17 erros "A extensão da imagem é inválida!".
- Fotos com erro hoje: **52** (43 Cordial, 9 Morar) — 26 erro 523, 17 extensão inválida, 9 estouro do limite de 20 requisições/minuto. Não existe limitador por site, apenas concorrência interna por imóvel.
- Reorganizar fotos usa a mesma fila de "atualização cadastral", que está **bloqueada pela trava de segurança** dos dados de proprietário. Ou seja: hoje reordenar não chega aos sites.
- A conclusão do cadastro não espera o lote de fotos terminar; novas fotos em imóvel já publicado não geram sincronização garantida.

Da integração, hoje só existem dois recursos de imagem confirmados no código: **listar** as imagens do imóvel e **inserir** imagem. Não há uso de recurso de excluir, reordenar ou definir destaque isoladamente.

## Etapa 0 — descobrir o que a API realmente oferece (antes de decidir a estratégia)

Sondagem somente de leitura/teste controlado, em um imóvel de teste de cada site, para verificar se existem recursos oficiais de excluir imagem, alterar ordem/posição e definir destaque. Nenhum endpoint será inventado.

- Se houver recurso de ordenação: a ordem é aplicada diretamente, sem reenviar arquivos.
- Se só houver inserir + listar + excluir: a ordem é reconstruída removendo e reinserindo a galeria na sequência correta, sempre uma por vez.
- Se não houver excluir nem ordenar: registro explícito da limitação, ordem garantida apenas em publicações novas, e nível de garantia gravado por publicação (nunca "sincronizado" falso).

## Etapa 1 — saneamento dos dados (sem apagar nenhuma foto)

Migração determinística: ordena de forma estável preservando ao máximo a ordem atual, renumera as posições de 0 a N-1 por imóvel, garante exatamente uma capa e a capa na posição 0. Validação do resultado antes de criar a regra de unicidade `(imóvel, posição)`. Nenhum arquivo é removido.

## Etapa 2 — posições à prova de concorrência

Registro de foto passa a alocar a posição dentro de uma rotina atômica no banco (bloqueio por imóvel), incluindo lotes inteiros. Reordenação e definição de capa passam pela mesma rotina, com renumeração completa 0..N-1 e capa = posição 0.

## Etapa 3 — caminho independente só para mídia

Nova ação de sincronização exclusiva de fotos, que:

- nunca chama a rota de alteração cadastral nem monta dados do imóvel;
- nunca lê ou grava vínculo de proprietário/corretor;
- continua liberada com a trava de segurança ligada (a trava permanece valendo integralmente para atualização cadastral).

Usada para foto adicionada, removida, reordenada, troca de capa, nova tentativa e reconciliação. A varredura automática de fotos passa a usar esse caminho.

## Etapa 4 — ordem que realmente chega aos sites

- Versão da galeria por imóvel e posição sincronizada por site, gravadas por publicação. Mover a foto da posição 7 para a 2 passa a contar como mudança de mídia.
- Quando a sequência remota determina a posição, o envio é **estritamente sequencial**: posição 0, confirma, posição 1, confirma, e assim por diante. Paralelismo só onde a ordem não influencia.

## Etapa 5 — nome do arquivo entregue

O arquivo original do usuário permanece intacto no armazenamento. Para o envio externo é gerado um nome seguro, minúsculo e coerente com o conteúdo (JPEG → `<id>.jpg`), com tipo de conteúdo correspondente e sem caracteres problemáticos.

## Etapa 6 — limite de requisições e novas tentativas

Limitador por site (não por imóvel), respeitando 20 requisições por minuto de forma global entre jobs paralelos, mais a espera indicada pelo próprio site quando informada. Erros de rede/523 seguem com nova tentativa e espera crescente; erros de extensão, já corrigíveis pelo pipeline, voltam à fila em vez de ficarem parados.

## Etapa 7 — lote de fotos com estado transacional

Ao escolher, por exemplo, 32 fotos, o lote guarda o total esperado e só é concluído quando todas foram registradas de forma durável (novas + duplicadas confirmadas). A conclusão do cadastro aguarda esse registro, persiste a ordem e só então dispara a sincronização de mídia. Foto com falha mantém status próprio, permite nova tentativa sem duplicar e impede indicação de "lote completo"; nenhum arquivo é descartado em silêncio. Em imóvel já publicado, todo lote concluído enfileira sincronização de mídia dos sites ativos.

## Etapa 8 — reconciliação e métricas

Comparação entre a galeria local publicável e a lista remota: quantidade, capa, identificadores e ordem quando a API permitir. Só é marcado como totalmente sincronizado com paridade. Métricas gravadas: esperado, sincronizado, com falha, versão da galeria, versão confirmada no site, último envio e última verificação. Onde a API não permitir confirmar, o nível de garantia obtido é registrado explicitamente.

## Etapa 9 — exclusão e capa

Exclusão local passa a gerar reconciliação no site (remoção quando a API oferecer). Troca de capa deixa de reenviar o arquivo quando existir recurso de destaque, evitando foto duplicada no site. Uso do identificador remoto da imagem em todas as operações.

## Etapa 10 — organizador de fotos (ajuste discreto)

Arrastar continua instantâneo; numeração determinística com posição 0 = capa; após recarregar, a ordem é idêntica; indicação discreta "Salvando ordem…" → "Ordem salva", e, quando fizer sentido, distinção entre ordem salva no Gestão e envio aos sites em andamento. Nenhuma foto salta de posição por atualização em segundo plano.

## Etapa 11 — recuperação dos casos atuais

Em lotes controlados, respeitando o limite por site: reenfileirar a sincronização de mídia dos imóveis saneados e as 52 fotos em erro pelo novo caminho. Nenhuma atualização cadastral é disparada e nada de proprietário/corretor é tocado.

## Testes

Unitários e de integração: posições únicas 0..N-1 com 1, 3, 10, 30 e 50 fotos, envios simultâneos, reordenação completa, arrastos rápidos seguidos, recarregar e sair da etapa logo após reordenar, adicionar foto em imóvel publicado, remover foto, trocar capa, falha de rede, erro 523, estouro de limite, nova tentativa, nomes `.JPG/.JPEG/.PNG/.WEBP` em várias caixas, arquivo convertido, Cordial, Morar e ambos ao mesmo tempo; sincronização de mídia com a trava ligada comprovando que nenhuma alteração cadastral foi chamada e que os campos de proprietário/corretor ficaram inalterados.

Teste crítico ponta a ponta: 30 fotos de uma vez, ordem manual 1..30, publicar nos dois sites e comprovar 30/30, mesma sequência e mesma capa nos três ambientes; depois inverter para 30..1 e comprovar novamente sem duplicar nenhuma foto.

## Fora de escopo (não será tocado)

Vínculos e contatos de proprietário/corretor, sua serialização, a investigação em andamento e a trava de segurança de atualização cadastral, que continua ativa.

## Entrega final

Relatório com causa raiz, migrações executadas, imóveis saneados, posições duplicadas antes/depois, fotos em erro antes/depois, publicações com fotos faltando antes/depois, arquivos alterados, testes executados, evidências de Cordial e Morar e confirmação explícita de que nada de proprietário/corretor foi alterado.
