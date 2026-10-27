# Importar Cordial 1178 / Morar 3003 (autorizado)

## O que será feito
1. Importar o anúncio Cordial 1178 (código interno 4140830): cria um único cadastro no Gestão com os dados do site, liga o código 1178 e traz as 9 fotos na ordem do site.
2. Importar o anúncio Morar 3003 (código interno 3653782): o sistema deve reconhecer que é o mesmo imóvel e só ligar o código 3003 ao mesmo cadastro. Se ele não reconhecer com certeza, paro e mostro para você decidir. Nada é unido sozinho.
3. Manter proprietário e corretor como estão em cada site, sem trocar nada.
4. Conferir: o imóvel aparece na busca por 1178 e por 3003, com as fotos na ordem certa, e nada foi enviado aos sites.
5. Criar o aviso diário em Integrações para anúncios ativos nos sites que ainda não estão no Gestão. Ele só avisa e nunca importa sozinho.

## Garantias
- Na ImobiBrasil é só leitura. Nenhum código novo e nenhuma exclusão.
- Se algum código aparecer reservado para outro imóvel, eu paro e aviso.

## Detalhes técnicos
- Pipeline existente `runImportWorker` com runs `commit` separados por site, cada um com um job `hydrate_property` (Cordial primeiro, Morar depois, para o `crossAccountMatch` encontrar o cadastro).
- Depois disso, conferir `property_provider_publications`, `provider_code_reservations` e `property_images`.
- Para o aviso: verificação somente leitura que compara a lista ativa de cada site com as publicações e mostra o resultado no painel de Integrações.
