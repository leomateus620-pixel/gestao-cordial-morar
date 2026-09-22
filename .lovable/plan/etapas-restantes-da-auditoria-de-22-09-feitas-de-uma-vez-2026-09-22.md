# Etapas restantes da auditoria de 22/09, feitas de uma vez

Continuação do plano já aprovado. O que já está pronto: conferência sem falso "publicado", reenvio de limpeza recusada, leitura paginada segura, comparação de números por tipo de campo e conflito Cordial x Morar que não depende da ordem das importações.

## 1. Um envio por vez para cada imóvel em cada site
- Dois envios do mesmo imóvel para o mesmo site nunca rodam ao mesmo tempo.
- Cada envio guarda a versão do imóvel que o originou. Quando existe uma versão mais nova, o envio antigo é absorvido por ela e não é mandado.
- Um envio que falhou com intenção ainda não entregue entra junto na próxima versão.
- Tudo o que é gravado depois da resposta do site confere antes se o envio ainda é o dono e se a versão ainda vale, inclusive no tratamento de erro.

## 2. Fotos com identidade e recuperação seguras
- Uma foto só recebe o código do site quando ela é a única foto nova e o conteúdo confere. Acaba a identificação pela ordem de envio.
- A reconstrução da galeria grava cada passo e o resultado de cada foto. Se for interrompida, continua de onde parou.
- Depois de um erro ao reenviar, a galeria é lida de novo antes de qualquer outra ação, para não inserir a mesma foto duas vezes.
- A galeria só é dada como concluída quando quantidade, fotos, ordem e capa batem. Galeria vazia ou incompleta nunca conta como concluída.
- As fotos antigas continuam guardadas até a conclusão.

## 3. Importação gravada de uma vez só
- A mudança vinda do site, a nova versão do imóvel, os conflitos e as referências de comparação são gravados juntos. Se uma parte falhar, nada é gravado e a importação é repetida.
- Envio confirmado atualiza a referência que a importação usa, para evitar o ciclo "enviar e depois importar de volta".
- O número de conflitos exibido passa a ser o total de pendências, não só os da última rodada.

## 4. Botões "Tentar de novo" que realmente fazem algo
- Envio que só deu certo em parte fica marcado como parcial, não como concluído.
- Os botões agendam de novo só a parte pendente, no cadastro ou nas fotos.
- Quando não há nada para refazer, a tela diz isso claramente.

## 5. Validação e entrega
- Novos testes automáticos: resposta perdida depois de o site aceitar, duas versões ao mesmo tempo, galeria vazia ou incompleta, falha ao registrar conflito, botão sem nada agendado.
- Teste real somente no imóvel de teste autorizado (Cordial 4355160 / Morar 4355161): editar, trocar uma foto, reordenar e tentar de novo, conferindo nos dois sites.
- Relatório de antes e depois para cada item da auditoria, e publicação ao final.

## Limites mantidos
- Nenhum imóvel ou cadastro é excluído nos sites.
- Nenhuma ação destrutiva em imóveis de clientes.
- Proprietário, corretor, códigos e agenda não são alterados.

## Detalhes técnicos
- Migrações apenas aditivas:
  - `origin_revision` e `pending_intents` nos jobs;
  - índice único parcial de job em execução por (property_id, provider);
  - RPC de claim com trava por imóvel e site;
  - RPC `property_remote_merge` (patch dinâmico validado nas colunas de properties, `revision + 1`, upsert de conflitos e atualização da publicação numa só transação);
  - coluna `rebuild_plan jsonb` para os passos da reconstrução da galeria.
- `sync.server.ts`: descarte de job superado; `assertJobLease` e condição de revisão antes de toda gravação posterior à chamada.
- `media-sync.server.ts`: remover o `matched_by: ordem_de_insercao`; gravar o checkpoint do plano; reler a galeria após erro; conferência completa da galeria.
- `publish.functions.ts` e `image-retry.server.ts`: estado `partial` e retorno `nothing_to_retry`.
