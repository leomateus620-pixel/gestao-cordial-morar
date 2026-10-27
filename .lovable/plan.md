# Trazer o imóvel Cordial 1178 / Morar 3003 para o Gestão

## O que já foi verificado (somente leitura)
- No Gestão não existe nada com esses códigos: nenhum imóvel, nenhuma reserva de código, nenhum vínculo de publicação, nenhum candidato de importação.
- No site Cordial o imóvel existe e está **ativo**: referência 1178, código interno ImobiBrasil 4140830, com proprietário e corretor vinculados.
- Consultar por "1178" direto falha porque a ImobiBrasil procura pelo código interno (4140830), não pela referência.
- Morar 3003: não apareceu nas primeiras 200 posições da lista ativa; a busca completa foi interrompida pelo limite de chamadas da ImobiBrasil. Ainda não confirmado.
- Motivo provável de não ter vindo: a importação automática só olha imóveis já vinculados; um imóvel que estava inativo na época da carga inicial nunca ganhou vínculo, e ao ser reativado não é "descoberto".

## Plano (nada muda nos sites; só leitura na ImobiBrasil)
1. **Confirmar o 3003 na Morar**: ler a lista ativa e inativa completa, devagar, e anotar o código interno. Se não existir, importar só o Cordial e avisar.
2. **Ver os detalhes dos dois** (tipo, finalidade, bairro, valor, fotos) e procurar no Gestão se já existe um imóvel igual cadastrado com outro código (mesmo endereço/proprietário). Se houver dúvida, paro e mostro para você decidir — nada é unido automaticamente.
3. **Simulação**: rodar a importação em modo "só simular" apenas para esses dois imóveis, e mostrar o resultado (novo, vínculo existente ou ambíguo).
4. **Importar de verdade** só com sua aprovação: criar um único imóvel no Gestão com os dados do site, vincular Cordial 1178 e Morar 3003 ao mesmo cadastro, registrar os dois códigos como reservados para ele, preservar proprietário e corretor, e copiar as fotos na ordem do site.
5. **Conferir**: imóvel aparece na busca por 1178 e 3003, fotos na ordem certa, e nenhuma alteração foi enviada aos sites.
6. **Evitar repetição**: adicionar à verificação diária a descoberta de imóveis ativos nos sites que ainda não existem no Gestão, apenas como aviso para o administrador (sem importar sozinho).

## Garantias
- Nenhuma escrita na ImobiBrasil; nenhum código novo inventado; nenhuma exclusão.
- Se algum código já estiver reservado para outro imóvel, a importação para e reporta.

## Detalhes técnicos
- Usar o pipeline existente (`import.server.ts`, `processHydrate`) com job de hidratação para `external_property_id` 4140830 (cordial) e o id da Morar, primeiro `dry_run`, depois `commit`.
- Cross-match entre contas já existe (`crossAccountMatch`) para unir as duas publicações no mesmo imóvel.
- Etapa 6: comparação lista ativa x `property_provider_publications`, gerando alerta em Integrações.
