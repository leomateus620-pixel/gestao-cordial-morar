# Reconfigurar os links de seleção dos dias 9 e 10

## O que foi verificado
- Foram criados 7 links nesses dois dias (4 Cordial, 3 Morar), todos ativos e válidos até dezembro.
- Os 20 imóveis dentro deles estão guardados corretamente e podem ser mostrados: nenhum está arquivado, oculto, em rascunho ou indisponível.
- Então a lista não se perdeu. Os imóveis não aparecem porque o link abre no endereço do sistema, ou num site novo que ainda não reconhece o caminho da seleção. A correção disso já está pronta na prévia, mas ainda não foi publicada.

## O que fazer
1. **Publicar a correção** feita antes (links no site de cada marca, links antigos redirecionando, botão "Ver anúncio no site"). Isso só acontece com a sua autorização, porque nenhuma publicação é feita sem ela.
2. **Gerar o endereço certo dos 7 links**, no site da marca de cada um (cordialimoveis.com/s/... ou imobiliariamorarimoveis.com.br/s/...), com os mesmos imóveis e na mesma ordem. Os links antigos que já foram enviados continuam funcionando e levam para o endereço novo, então ninguém precisa receber um link de novo.
3. **Abrir cada um dos 7 links sem login**, no endereço novo e no antigo, e confirmar que aparece o número certo de imóveis em cada um (1, 6, 2, 4, 2, 3 e 2).
4. **Entregar a lista** com o corretor, a marca, a quantidade de imóveis e o endereço novo de cada link.

## Ponto de atenção
- Algumas seleções da Cordial têm imóveis que só existem na Morar (2362, 2758, 3269, 3301). Eles aparecem na seleção, mas o botão "Ver anúncio no site" não aparece para eles, porque não estão no site da Cordial. Nada será mudado nisso sem você pedir.

## Detalhes técnicos
- Nada muda no banco de dados: os tokens e os itens das seleções ficam como estão, e o endereço novo é só o mesmo token no domínio da marca (`selectionPublicUrl`).
- A verificação será feita com `shared_selection_public(token)` e Playwright nos domínios publicados.
