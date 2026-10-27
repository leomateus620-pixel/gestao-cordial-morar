# Morar 2758 e 3003: trazer para o Gestão e exibir no site da Morar

## O que já foi verificado (somente leitura)
- **Morar 2758**: o anúncio existe e está ativo na ImobiBrasil (código interno 2961643). No Gestão não há nada com esse código: nenhum cadastro, nenhuma reserva e nenhum vínculo.
- **Morar 3003**: o imóvel já está no Gestão, com os códigos 1178 e 3003, mas ainda não foi enviado ao site da Morar mantido pelo Gestão.
- O site só exibe um imóvel quando ele tem autorização e disponibilidade confirmadas. O 3003 veio da importação sem essas duas marcações, por isso ainda não aparece.

## Etapas
1. **Ler o 2758** (tipo, finalidade, bairro, valor e fotos) e procurar se ele também existe na Cordial ou já está cadastrado no Gestão com outro código. Se houver dúvida, paro e mostro para você. Nada é unido sozinho.
2. **Simular e depois importar o 2758** pelo mesmo caminho do 3003: um único cadastro, com o código 2758 reservado para ele e as fotos na ordem do site.
3. **Impedir envios automáticos** ao ImobiBrasil gerados pela importação, como foi feito com o 3003.
4. **Exibir os dois no site da Morar**: tomo o seu pedido como a autorização do proprietário e a confirmação de que o imóvel está disponível. Os dois saem com os códigos públicos 2758 e 3003 e seguem as regras atuais do site, inclusive endereço oculto quando for o caso.
5. **Conferir**: os dois aparecem na busca do Gestão e na busca pública do site da Morar, com as fotos certas. Nada é alterado nos anúncios da ImobiBrasil.

## Garantias
- Na ImobiBrasil é só leitura. Nenhum código novo, nenhuma exclusão e nenhuma troca de proprietário ou corretor.
- Se o 2758 já estiver reservado para outro imóvel, eu paro e aviso.

## Detalhes técnicos
- Importação: run `commit` com job `hydrate_property` para o 2961643 (morar), mais as reservas `committed` e `codigo_morar`. Depois, cancelar os `property_sync_jobs` pendentes desse imóvel.
- Publicação: `morar_site_publications` pela mesma regra do `morar_site_review`, com `morar_authorized` e `availability_confirmed` verdadeiros, o hash de conteúdo revisado e o estado `published`. O registro sai com o ator admin, e eu confiro na tabela de auditoria.
- Verificação: `morar_site_search` pelos códigos.
