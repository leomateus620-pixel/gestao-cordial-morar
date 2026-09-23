# Retirar e reenviar as fotos dos anúncios recentes (Cordial e Morar)

## O que será feito
Em cada anúncio, as fotos que estão hoje no site saem e as fotos do Gestão entram de novo, na ordem do Gestão e com a mesma capa. No fim, o site fica com a mesma quantidade de fotos que o Gestão.

Anúncios já lidos e aprovados:

| Imóvel | Site | Sai do site | Reenviar | Total final |
|---|---|---|---|---|
| 1381 | Cordial | 2 | 6 | 7 (a capa atual fica) |
| 1377 | Cordial | 13 | 13 | 13 |
| 3376 | Morar | 13 | 13 | 13 |
| 3377 | Morar | 15 | 15 | 15 |
| 3378 | Morar | 41 | 41 | 41 |
| 1380 | Cordial | 14 | 14 | 14 |
| 1384 | Cordial | 14 | 16 | 17 (a capa atual fica) |

Ordem de execução: começa pelo 1381 Cordial. Só depois de conferir que ele terminou certo, faz os outros, um anúncio por vez.

Anúncios que o site não deixou ler: 1378 Cordial, 1379 Cordial, 3379 Morar, 3380 Morar e 3383 Morar. Leio de novo, com pausas para respeitar o limite do site, e mostro a lista do que sai antes de retirar qualquer foto.

## Segurança
- As fotos saem uma por vez. Uma foto só conta como retirada depois que o site confirma. Se alguma retirada falhar, o anúncio para e não recebe fotos novas.
- O reenvio respeita o limite de pedidos por minuto de cada site. Cordial e Morar andam separados.
- Uma foto só conta como enviada quando o site devolve o código dela.
- Depois do envio, leio o site de novo e confiro quantidade, ordem e capa. Só nessa hora o anúncio conta como "igual ao Gestão".
- Anúncio, cadastro, proprietário, corretor e códigos não são tocados. Nenhum anúncio novo é criado.

## Para os próximos imóveis
Publicar junto a correção já pronta, que envia as fotos que faltam na ordem do Gestão, com uma capa só. Assim, os imóveis novos já vão certos para o site.

## Detalhes técnicos
- Ferramenta pontual: `gallery-align.server.ts` + gancho protegido `/api/public/hooks/gallery-align` (segredo do servidor), com `apply:true` por imóvel e site.
- Registros das fotos retiradas voltam para `pending` sem código. `media_rebuild_state` é limpo. Um `media_sync` fica na fila para o worker de mídia.
- Relatório final por anúncio, em três níveis: tarefa executada, efeito confirmado no site e galeria igual ao Gestão.
