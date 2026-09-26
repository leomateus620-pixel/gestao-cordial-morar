# Contrato público e publicação

## Limite de confiança

As funções internas autenticadas não foram transformadas em funções públicas. O site usa loaders isomórficos: chamada direta ao serviço no SSR, API REST própria no navegador. A API ignora sessões e tokens do visitante ao consultar dados. A credencial de servidor é usada exclusivamente em arquivos `.server.ts`; nunca use prefixo `VITE_` para esse segredo.

O contrato em `src/lib/cordial-site/contract.ts` valida e remove chaves desconhecidas antes de serializar. O SQL constrói JSON com lista explícita. Não há `select('*')` no limite público. A listagem remove a descrição integral e carrega somente a capa; a galeria fica no detalhe.

| Campo público                                 | Origem/regra                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                                          | UUID próprio do canal, separado de `properties.id`                                |
| `reference`                                   | Código Cordial preservado na primeira aprovação; `C-000001…` para ausência/`GC-…` |
| `operation`, `type`                           | Operação e tipo canônicos, sem mesclar aliases                                    |
| `city`, `district`, `state`                   | Localização aproximada; cidade/bairro vazio ou `0` não vira sugestão              |
| `address`                                     | Rua/número somente se `exibir_endereco_site = sim`                                |
| `price`, `priceMode`                          | Preço fixo ou consulta; ausente permanece nulo                                    |
| `bedrooms`, `bathrooms`, `suites`, `parking`  | Quantidades canônicas; desconhecido não vira zero                                 |
| `areas`                                       | Útil, total, construída e terreno separados; exigem confirmação de m²             |
| `furnished`, `exchange`, `financing`, `stage` | Estados triados sem inferir nulo como não                                         |
| `featured`, `publishedAt`                     | Destaque do Gestão e primeira publicação no canal próprio                         |
| `description`, `features`                     | Conteúdo revisado, texto escapado; nunca HTML confiável                           |
| `cover`, `photoCount`, `images`               | IDs/versionamento próprios, dimensões e posição; caminho privado nunca sai        |

Não são retornados: ID canônico interno, carteira, código Morar, proprietário, telefones/e-mails do proprietário, observações, outras informações internas, comissões, documentos, histórico privado, credenciais, mapa interno/coordenadas ou URLs de Storage. IPTU e condomínio não são publicados sem modelo confirmado de periodicidade. `acomodacoes` não foi convertido em dormitórios. Pontos fortes não foram automaticamente concatenados: esse campo tem histórico de notas de integração e exige revisão editorial específica.

O texto livre e as fotos também podem revelar endereço ou dados privados: a publicação exige revisão humana explícita desses conteúdos. A projeção não promete detectar semanticamente todas as informações privadas dentro de uma fotografia ou parágrafo. Mudança de descrição/características/endereço/tipo/operação/áreas/unidades invalida o hash de aprovação e retira a oferta até nova revisão. Preço rotineiro se atualiza sem promover a ordem editorial.

## Elegibilidade única

Todas as consultas públicas usam `cordial_site_eligible`: decisão `published`, autorização Cordial e disponibilidade confirmadas, conteúdo revisado igual ao atual, data editorial presente, sem rascunho/arquivamento/remoção, exibição explicitamente verdadeira, sem autorização negada, disponibilidade compatível e operação venda/aluguel.

Uma autorização nula no cadastro **não** concede permissão. O administrador deve registrar um vínculo explícito no novo canal; autorização negada permanece bloqueio. A origem `carteira` e o estado ImobiBrasil não publicam nada. Imóvel somente Morar não aparece por padrão. Se houver nova autorização comercial para a Cordial, o operador registra essa decisão com identidade, histórico e revisão, sem mudar a carteira nem depender do fornecedor.

O código público é estável por publicação; editar um código cadastral posteriormente não reescreve URLs e referências já distribuídas silenciosamente. Mudança de referência comercial exige reconciliação deliberada. Não há requisito de ID ImobiBrasil para novos imóveis.

Home, resultados, facetas, bairros, relacionados, detalhe, sitemap e mídias derivam da mesma elegibilidade. A galeria exige revisão de todas as imagens correntes; alteração que invalide uma aprovação oculta a galeria inteira até revisão, evitando promover indevidamente outra foto a capa.

## Busca

Parâmetros permitidos: finalidade, tipo, cidade, bairro, referência exata/parcial, busca textual limitada a tipo/cidade/bairro, cômodos com comparação mínima/exata, valores, área por significado, mobiliado, permuta, financiamento, estágio, fotos, destaque, forma de preço, ordenação, página e grade/lista. Intervalos são não negativos, finitos e coerentes; cômodos inteiros até 100; páginas de 12, limite defensivo de 10.000 páginas. Contagem e itens são derivados do mesmo CTE materializado em uma consulta. Ordenação termina em UUID público, sem usar `updated_at` da integração.

Parâmetros são tipados e consultas parametrizadas. Busca de referência usa igualdade/`strpos` literais, sem interpolar SQL nem tratar `%` como curinga. Código Morar, mapa e proprietário não alimentam pesquisa/sugestões. Todos os tipos válidos do conjunto elegível aparecem nas facetas; nenhuma normalização de aliases foi aplicada aos registros.

## Contato e atendimento

`POST /api/cordial-site/leads`: origem do próprio site, JSON até 10 KB, validação no servidor, consentimento explícito, honeypot, limites persistidos e chave de idempotência. O servidor confirma sucesso somente após persistência. A deduplicação considera request ID e impressão pseudonimizada de telefone/finalidade/imóvel/mensagem durante dez minutos.

A fila privada registra origem, imóvel canônico associado pelo UUID público, referência, propósito, página e somente `utm_source`, `utm_medium`, `utm_campaign`. O visitante não escolhe um ID interno. A política de privacidade precisa estar configurada; seu hash é salvo com o consentimento. O navegador conserva o formulário em falha. WhatsApp é link, não evento de atendimento concluído.

O operador confirma finalidade/tipo antes de criar atendimento. A RPC bloqueia duplicação por fila e não cria cliente, agenda ou corretor fictício. No módulo inicial, a administração acessa essa triagem; a permissão SQL também admite secretaria para futura superfície apropriada. Validar os triggers reais do atendimento em homologação continua obrigatório.

## Segurança operacional

RLS e grants mantêm as entidades privadas. Somente o serviço lê as visões públicas; visitantes chamam os endpoints limitados. Publicação/configuração exigem `has_role(admin)` e auditoria. Contatos são restritos a admin/secretaria. A mídia usa ID novo + versão + tamanho enumerado, nunca um caminho ou URL informado pelo cliente.

Sem cabeçalho de IP explicitamente confiável, o limitador usa um grupo compartilhado conservador. O proxy deve sobrescrever o cabeçalho configurado. Defina um segredo aleatório exclusivo para os hashes. A homologação permite Basic Auth opcional no limite público; não altera a autenticação do Gestão. Cookies enviados na mesma origem não são usados como autorização de imóvel público.
