# Aproveitar os vínculos de proprietário restaurados pela ImobiBrasil

## O que já conferi (só leitura)
- Os sites passaram a devolver o proprietário: numa amostra de 50 imóveis por conta, cerca de 10 já vêm com o código do proprietário (antes era sempre 0).
- Outros continuam sem proprietário, incluindo o imóvel de teste e os anúncios mais novos. Ainda não dá para saber se isso significa que o imóvel não tem dono cadastrado ou que a restauração não chegou a ele.
- No Gestão, só 1 anúncio da Cordial e 4 da Morar têm o código do proprietário guardado. Por isso o envio ainda não consegue proteger o proprietário da maioria.

## O que será feito
1. **Levantamento completo, só leitura.** Ler todos os imóveis das duas contas (ativos e inativos) e comparar com a lista dos 543 imóveis enviada ao suporte. O resultado separa três grupos: restaurados, ainda sem proprietário e imóveis sem dono no cadastro. Nada é gravado nesta etapa.
2. **Guardar os códigos no Gestão.** Para cada anúncio, gravar os códigos de proprietário e corretor que o site devolveu. Só o código é guardado; nome, telefone e e-mail do Gestão não são alterados. Um código vazio lido no site nunca apaga um código já guardado. Esta é a única etapa que grava no banco.
3. **Contato do proprietário na ficha interna.** Com o código em mãos, ler o contato do proprietário nos sites. Ele só preenche a ficha quando o campo estiver vazio no Gestão. Se os valores forem diferentes, a diferença fica listada para vocês decidirem.
4. **Conferência de segurança num imóvel com proprietário.** Fazer uma edição mínima e reversível (só o campo "local da chave") em um imóvel de cada site que tenha proprietário. Depois, confirmar pela leitura que o proprietário continuou o mesmo. Isso só será feito nos imóveis que vocês autorizarem.
5. **Encerrar pendências.** Marcar como resolvidos os itens que dependiam do suporte. Entregar um relatório com os imóveis que continuam sem proprietário, para enviar de volta à ImobiBrasil se for necessário.

## O que não será feito
- Nenhum proprietário será escolhido pelo nome. Sem código confirmado, o vínculo não é enviado.
- Nenhum proprietário, corretor ou código será alterado nos sites.

## Detalhes técnicos
- A leitura usa as listas paginadas de imóveis ativos e inativos e os dados de cada imóvel. A etapa 1 não escreve nada.
- A etapa 2 atualiza os códigos de proprietário, corretor e usuário adicional de cada anúncio somente quando o valor lido no site for diferente de zero.
- O relatório fica em `docs/IMOBI-PROPRIETARIO-RESTAURACAO.md`, junto com a lista em planilha.
