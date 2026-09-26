# Mídia, atualização e retirada

O bucket original `property-images` continua privado. Cada imagem revisada recebe identidade pública própria e assinatura de versão baseada em caminho original/processado/thumbnail, checksums, processamento, watermark e atualização. A ordem vem de `property_images.position`; `is_cover` não substitui a posição zero.

URL estável: `/api/cordial-site/media/{uuid-publico}/{versao}/{thumb|card|full}`. Não é uma URL assinada de uma hora. O servidor consulta elegibilidade e aprovação em **cada requisição**, resolve internamente o arquivo canônico e decodifica/reencoda JPEG. Saídas de até 480, 960 ou 1920 px sem ampliar o original; EXIF/GPS não são entregues. Não é aplicada uma segunda marca-d’água.

Fotos `ready` devem ter derivado e marca Cordial ou combinada. Fotos `legacy` dependem de revisão explícita de direitos, marca, associação, ordem e privacidade; não são aprovadas em lote por origem/nome. Se alguma foto mudar ou não estiver autorizada, a galeria fica indisponível até nova revisão. Ausência de fotos e erro de carregamento têm mensagens diferentes.

Cards carregam apenas capa responsiva. A home prioriza a fotografia principal. O detalhe carrega três imagens inicialmente, com miniaturas sob demanda no lightbox. Dimensões e proporções reservam espaço; imagens sem dimensão cadastrada usam contêiner previsível, sem inventar resolução original. A auditoria de baixa resolução é uma pendência de qualidade, sem substituição por outra fotografia.

| Superfície                  | Política                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| HTML e JSON                 | `Cache-Control: no-store`                                                                 |
| Mídia                       | `private, max-age=30, must-revalidate`; CDN não deve sobrescrever                         |
| Aprovação e disponibilidade | Reavaliadas no banco em toda leitura                                                      |
| Página já aberta            | Revalidação a cada 45 s quando visível e ao recuperar foco                                |
| Despublicação confirmada    | Nova leitura exclui oferta e bloqueia mídia; arquivos já baixados não podem ser revogados |
| Sitemap                     | Somente anúncios atualmente elegíveis, sem cache de oferta antiga                         |

Meta de atualização usual: até 60 s para páginas abertas, sob conectividade saudável (45 s de revalidação + prazo de requisição). HTML/JSON novos não esperam TTL de CDN. O navegador pode reutilizar mídia por até 30 s. Aba suspensa revalida ao voltar. Uma imagem já desenhada ou salva por terceiro não desaparece remotamente; não se promete revogação absoluta.

Não existe consulta ao fornecedor durante navegação, busca, detalhe ou mídia. O processamento em tempo de requisição privilegia retirada rápida e simplicidade de propriedade, mas exige medir CPU/memória/concurrency no destino. Há limites de arquivo e de pixels; validar especialmente decodificação de imagens malformadas e proteção do runtime em homologação. Para alto tráfego, uma etapa futura pode persistir derivados em armazenamento próprio, conservando o mesmo gateway de autorização e limites de retirada. Não habilitar cache público longo como atalho.

O relatório privado `media-audit.json` verifica presença e posições de todo o inventário. A amostra visual e o teste HTTP verificam apenas o conjunto local de QA. Não há comprovação de equivalência visual integral das 12.110 imagens, nem teste de expiração por espera real de uma hora: a independência de assinatura é estrutural e foi verificada pelas URLs/bytes estáveis e consultas privadas no gateway.
