# Terminar as fotos dos anúncios recentes, mais rápido

## Por que o 1381 demorou
- O envio automático ficou parado por uma falha de rede fora do sistema. Tive que rodar tudo à mão.
- Cada problema achado no caminho (ordem invertida, código não devolvido) exigiu parar, corrigir e recomeçar.
- Quando uma tarefa travava, ela esperava até 1 hora para tentar de novo.

Essas causas já estão corrigidas ou vão ser contornadas agora. O tempo por anúncio passa a depender só do limite do site, de 20 pedidos por minuto.

## Anúncios já aprovados (retirar e reenviar)
Cordial: 1384 (17 fotos), 1377 (13), 1380 (14).
Morar: 3376 (13), 3377 (15), 3378 (41).

Cordial e Morar vão rodar ao mesmo tempo, porque o limite de cada site é separado. Dentro de cada site, um anúncio por vez.

Tempo estimado: uns 3 a 4 minutos por anúncio pequeno e uns 8 minutos para o 3378, que tem 41 fotos. No total, algo entre 20 e 30 minutos. É uma estimativa.

## Anúncios que ainda preciso ler
1378 e 1379 na Cordial; 3379, 3380 e 3383 na Morar.
- Primeiro leio esses cinco, só olhando.
- Os que já estiverem iguais ao Gestão ficam como estão.
- Para os diferentes, mostro a lista do que sai do site e do que entra, e espero você aprovar.

## Finalizar a correção
1. **Envio automático não fica mais parado:** o pedido que dispara o envio passa a esperar mais tempo antes de desistir.
2. **Tarefa travada tenta de novo em poucos minutos**, e não em 1 hora. Isso só vale quando falta confirmar a entrada de uma foto.
3. **Foto nova num anúncio que já está no site:** o site sempre mostra a foto nova logo depois da capa. Então, quando alguém acrescenta uma foto no fim ou muda a ordem, o sistema:
   - retira do site só as fotos que estão fora do lugar;
   - reenvia essas fotos na ordem certa.

   Isso vale para todos os imóveis novos e editados daqui em diante. Nunca apaga o anúncio.
4. **Ao terminar cada anúncio**, o sistema lê o site e compara com o Gestão: quantidade, ordem e capa. Só marca "concluído" se estiver tudo igual.
5. **Relatório por anúncio** em três níveis: tarefa rodou, entrada confirmada no site, galeria igual ao Gestão.

## O que não muda
Anúncio, cadastro, proprietário, corretor e códigos continuam como estão. Nenhum anúncio novo é criado. Nenhuma foto antiga de outros imóveis é reenviada.

## Detalhes técnicos
- Durante a execução: laço local chama `gallery-align` com `apply:true` e, em seguida, o worker de mídia só da publicação alvo. Cordial e Morar rodam em processos paralelos, com pausa de 3 s entre pedidos. Se o site responder 429, espera 60 s.
- Cron `property-media-worker`: aumentar o `timeout_milliseconds` do `net.http_post` de 5000 para 30000. Isso muda só o agendamento; a lógica fica igual.
- Retry com a causa `remote_read_unreliable` e envio incerto: `next_run_at` passa a ser 2 min.
- `deliverGallery`: se uma foto pendente tiver posição menor que uma foto já enviada (que não seja a capa), usa o caminho de reconstrução parcial. Esse caminho retira do site as fotos a partir da primeira fora de ordem e reenvia com `sendOrderForSite`. Tudo com teste.
