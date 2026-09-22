# Restauração dos vínculos de proprietário — 22/09/2026

## Levantamento (somente leitura nos sites)
| | Cordial | Morar |
|---|---|---|
| Imóveis lidos (ativos + inativos) | 647 | 774 (2ª leitura parcial: 665) |
| Com proprietário no site | 584 | 721 |
| Da lista enviada ao suporte: restaurados | 259 de 288 | 232 de 255 |
| Da lista: ainda sem proprietário | 28 | 22 |
| Da lista: não encontrados na leitura | 1 | 1 |

Lista dos que continuam sem proprietário: `/mnt/documents/imoveis-sem-proprietario-apos-restauracao-22-09-2026.csv`.

## Gravado no Gestão
- Códigos de proprietário/corretor/usuário adicional atualizados: Cordial 476 anúncios, Morar 302.
- Regra: código zero/vazio lido no site nunca apaga o que estava guardado. Nenhum vínculo por nome.
- Contato do proprietário (nome, telefone, e-mail) preenchido só em fichas vazias, lendo `/pessoa/dados/{codigo}`; valor diferente vira divergência, não é sobrescrito.

## Ferramenta
- `src/lib/imobibrasil/owner-links.server.ts` (`refreshOwnerLinks`) e botão "Atualizar proprietários do site" em Integrações (administradores). Pode ser repetido: completa 15 contatos por clique.

## Proteção no envio
Toda alteração lê o imóvel antes de enviar e reenvia os códigos (guardados + lidos), porque `POST /imovel/alterar` zera campos omitidos. Com os códigos agora guardados, a proteção cobre a grande maioria dos anúncios.

## Pendente
- Teste de edição mínima num imóvel com proprietário em cada site — aguardando autorização do imóvel.
