# Renovação do site Morar Imóveis

Objetivo: levar à Morar a mesma estrutura e o mesmo acabamento da Cordial, mantendo a identidade laranja e grafite da Morar. A Cordial não muda e nada é publicado sem a sua autorização.

## O que já foi confirmado no código
- As seções da página inicial da Morar usam um efeito de aparecer que só funciona com a rolagem (o observador fica no cabeçalho, com limiar de 8%). Isso deixa blocos inteiros invisíveis até a pessoa rolar. **É a causa comprovada** das fotos que "não aparecem".
- O cabeçalho, os cards, a página do imóvel e os resultados têm 16, 8, 9 e 3 trechos exclusivos da Cordial (`brand === "cordial"`).
- A vitrine semanal hoje só existe para a Cordial: tabelas, armazenamento de arquivos e funções próprias.

## Etapas (todas em uma única entrega)

1. **Conteúdo visível desde o início**: as seções aparecem por padrão; o efeito de entrada fica só como enfeite, nunca esconde anúncios. Revisar as fotos já carregadas (do cache) para não ficarem presas no estado de carregamento.
2. **Marca nos links e serviços**: links, favoritos, minha seleção, WhatsApp e endereços de fotos passam a seguir a marca da página. Na Morar, tudo fica em /site-morar e usa os códigos da própria Morar.
3. **Cabeçalho claro**: fundo branco com a logo da Morar (versão transparente, se existir no projeto; senão, recorte fiel da logo atual), ícones, detalhes em laranja e menu de celular acessível.
4. **Abertura**: foto em tela cheia, título "O seu próximo lar. Mais perto de você.", busca compacta à esquerda e o card do imóvel da semana à direita, também no celular. Leve aproximação da foto, que pausa fora da tela e respeita a opção de reduzir movimento. O WhatsApp só aparece se a Morar tiver o número configurado.
5. **Busca compacta**: Comprar/Alugar, tipo, cidade, bairro e valor visíveis; o resto fica em "Mais filtros". Contagens e opções só do catálogo da Morar.
6. **Cinco destaques com os bairros ao lado**: mesma regra da Cordial (os mais recentes com capa, ou escolha editorial). No desktop, os cinco cabem em 1280×720, 1366×768 e 1440×900.
7. **Mais quinze imóveis** diferentes dos destaques, logo abaixo, seguidos do institucional, dos serviços e do contato.
8. **Vitrine semanal da Morar**: o banco passa a separar as campanhas por marca, sem apagar dados (as campanhas atuais ficam marcadas como Cordial). Cada marca tem sua própria pasta de arquivos, trava de processamento, controle de cobrança e agendamento. A Morar troca na segunda às 6h, horário de Brasília. Uma aba "Vitrine do site Morar" é adicionada à administração da Morar. Nada é gerado durante as visitas; enquanto a edição não for aprovada, aparece a foto original.
9. **Fotos**: a da abertura carrega primeiro; tamanhos certos para cada tipo de card; as demais carregam conforme a rolagem; a proteção atual das fotos continua igual.
10. **Testes e conferência**: testes da seleção 5 + 15, da separação entre marcas, das fotos em cache e de não haver cobrança duplicada na vitrine. Conferência em 1280, 1366, 1440, tablet, 390 e 360 px, com medição de velocidade antes e depois em laboratório. Também verifico que a Cordial continua igual.

## Pontos que dependem de você
- A geração da edição semanal da Morar gasta créditos de IA (cerca de 1 crédito por tentativa) e só vai ao ar depois que você aprovar.
- A foto atual com a marca Cordial: vou priorizar fotos sem marca e não vou apagar marcas.
- Não tenho como testar em aparelho real; a conferência será por simulação.

## Detalhes técnicos
- Remover a dependência de opacidade de `.cs-reveal.cs-observed` (site.css 1743/2649) e passar a observar sentinelas com rootMargin. Em PropertyImage, checar `complete && naturalWidth` na montagem.
- Generalizar `propertyPath/sitePath/propertyUrl/loadShowcase` com `brand` explícito. Extrair o mosaico, a abertura e os cards compactos de HomePage para componentes parametrizados e reutilizar `selectFeatured/selectMore`.
- Migração aditiva: coluna `brand` com padrão 'cordial' nas tabelas `cordial_site_showcase_*`, índices únicos com a marca, RPCs com parâmetro de marca, bucket `morar-showcase` privado, cron via `internal_worker_headers()` e `meta_reviewer_block` em tabelas novas.
- Cache em memória com chave por marca; sem copiar o fallback `lastHome` para anúncios retirados confirmados.
