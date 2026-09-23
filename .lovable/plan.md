# Ajustes 060000/061000, leitura de fotos com prova do total, publicação nova e endereço

Princípio: o Gestão decide o cadastro, os sites de destino, a publicação, a ordem, a capa e as fotos. A leitura dos sites só confirma entregas, aponta diferenças e registra conflitos, sem sobrescrever o Gestão. Não haverá reimportação completa, republicação em massa nem reprocessamento das fotos antigas. As importações diárias e o ajuste 230002 continuam de fora.

## 1. Confirmar a versão publicada e corrigir a leitura das fotos
- Identificar a versão que está no ar comparando o código servido em cordialgestao.com com a versão atual do projeto. Registrar o horário e a identificação, sem inventar número de versão.
- Rever a correção de 23/09: página 2 igual à página 1 deixa de provar sozinha que a lista está completa. A leitura só vale como completa quando houver prova do total vinda de outra fonte:
  - o total de fotos na ficha do imóvel no site bate com a lista; ou
  - os códigos das fotos que o Gestão já enviou para aquele site aparecem todos, com a mesma quantidade e a mesma capa.
- Sem essa prova, a leitura continua duvidosa. A tarefa espera e nada é reenviado.
- Testes: lista cortada em 50 com total 58 fica duvidosa; lista repetida sem total fica duvidosa; repetição com total igual vale como completa.

## 2. Aplicar o 060000 sem as importações diárias
- Antes: guardar as regras de acesso e as funções atuais, e preparar o SQL que desfaz o ajuste.
- Criar um arquivo novo do ajuste, igual ao 060000 mas sem as duas rotinas de importação diária. O arquivo original não é mexido.
- Testar dentro de uma transação desfeita no fim, como visitante, corretor, secretaria, administração e sistema:
  - quem pode ler, incluir, alterar e apagar fotos;
  - quem pode usar as funções novas.
- Se algum teste der resultado diferente do esperado, parar e mostrar.

## 3. Aplicar o 061000
- Mesmo cuidado: guardar o estado antes, preparar o desfazimento e aplicar o arquivo igual ao do projeto.
- Testar, com os mesmos cinco perfis e desfazendo no fim: lotes de fotos, controle de fotos enviadas pela tela, lista de problemas de envio e limpeza semanal (que só apaga esses controles).
- Conferir que a lista de problemas de envio volta a funcionar na tela do imóvel.

## 4. Ocultar ou excluir imóvel com fotos antigas
- Simulação no banco, desfeita no fim, com um imóvel que tenha fotos antigas. O imóvel 1384 e os anúncios reais ficam de fora.
- Ocultar e excluir não podem colocar fotos na fila de marca-d'água, nem criar envio de fotos em massa, nem alterar as fotos antigas.
- Aceito: só a tarefa de retirar do site, por site de destino.
- Se aparecer reprocessamento ou reenvio, parar.

## 5. Anúncio novo continua saindo normalmente
- Cadastro novo publicado no Gestão: cria o anúncio só nos sites escolhidos.
  - Cada site tem seu próprio código e sua própria fila.
  - As fotos salvas no Gestão são enviadas na ordem escolhida e com a capa escolhida.
- Criação ou envio de foto com resultado incerto:
  - primeiro, ler o site;
  - repetir só se ficar provado que não entrou;
  - nunca criar anúncio duplicado nem marcar como concluído sem confirmação.
- Conferir as regras que já existem para isso e cobrir com teste:
  - falha no site A não trava o site B;
  - criação incerta não duplica;
  - fotos novas não caem no tratamento de fotos antigas.

## 6. Endereço dos dois imóveis
- Confirmar os códigos internos e os vínculos com os sites de "270 ap 103 Cancun" e "380 Residencial Ravena , Ap 504 - Bloco 01".
- Guardar o texto original no histórico do imóvel.
- Alterar só o número e o complemento:
  - 270 / ap 103 Cancun;
  - 380 / Residencial Ravena, Ap 504 - Bloco 01.
- Proprietário, corretor e demais dados não mudam, e nenhum anúncio novo é criado.
- A correção segue pelo envio normal, que manda ao site só o que mudou.

## 7. Publicar e acompanhar
- Publicar o código da etapa 1 e o que a etapa 5 exigir. Informar o horário e a versão confirmada no ar.
- Acompanhar cada site separadamente:
  - a primeira tarefa confirmada, com horário e código;
  - depois, se o cadastro e a galeria (quantidade, ordem e capa) ficaram iguais nos imóveis 1381, 1373 e 1379 e nos pares Morar.
- O 1384 só é observado, sem ação.
- O relatório separa três níveis: tarefa rodando, efeito confirmado no site e galeria igual à do Gestão.

## Detalhes técnicos
- Leitura das fotos: a função `fetchRemoteGallery` e a função `fetchAllImagePagesWith` só aceitam a lista como completa com prova do total: o total da ficha do imóvel, ou os vínculos confirmados daquele site, com a mesma contagem e a mesma capa.
- 060000: novo arquivo de ajuste com o mesmo conteúdo, exceto os dois comandos de agendamento das importações diárias. Desfazimento a partir das definições atuais das regras e funções.
- Testes de permissão: dentro de uma transação desfeita no fim, assumindo cada perfil (visitante, corretor, secretaria, administração e sistema).
- Endereço: registro no histórico, alteração só de número e complemento, e envio normal pela fila.
- Pendentes: ajuste 230002 (faltam os segredos) e política de importação seletiva por campo antes de ligar as importações diárias.
