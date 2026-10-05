# Mídia, atualização e retirada

## Entrega

O bucket original `property-images` permanece privado. A URL pública estável tem formato `/api/morar-site/media/{id-do-canal}/{versão}/{thumb|card|full}`. ID/versão precisam constar em `morar_site_authorized_media` para imóvel ainda elegível. O visitante não pode informar caminho, bucket, URL externa ou ID Cordial para obter fotos pelo canal Morar.

A entrega lê o objeto canônico aprovado e gera JPEG responsivo, removendo metadados EXIF/GPS, sem aumentar resolução e sem aplicar marca duplicada. Larguras máximas: 480, 960 e 1920 px. Decodificação limitada a 25 MB e 60 megapixels; arquivos não suportados/falhos recebem erro explícito, não fotografia substituta. Não são gravadas URLs assinadas temporárias em HTML estático, sitemap ou Open Graph.

Cards pedem somente capa; galeria completa é carregada no detalhe e miniaturas por demanda. Dimensões, `srcset`, lazy loading e prioridade da imagem principal mantêm proporção e reduzem deslocamentos.

## Política de cache

- HTML, JSON, decisões, leads e sitemap: `Cache-Control: no-store`.
- Mídia autorizada: `private, max-age=30, must-revalidate`, ETag por versão e tamanho.
- Toda nova consulta reavalia elegibilidade no banco; não depende da invalidação React do funcionário.
- Mudanças usuais são refletidas na próxima consulta; alvo operacional até 60 segundos, condicionado ao banco/runtime e ao cumprimento dos headers pelo ingress.
- Novas consultas após a retirada no banco são bloqueadas. A entrega revalida ID/versão e elegibilidade depois do download/processamento e antes de liberar os bytes, reduzindo a janela de uma retirada concorrente. Uma resposta já em trânsito ou uma cópia recebida pode permanecer; o prazo de cache de 30 segundos começa no recebimento. Arquivos já baixados por terceiros não podem ser revogados.

Não configure CDN/HTML cache longo sobre estes endpoints. Verifique o ingress após deploy, inclusive 404/410 e versões anteriores de mídia. Bucket original não deve receber regra pública.

## Publicação e arquivamento

A intenção própria Morar é independente da integração ImobiBrasil. Novos cadastros usam `finalizePropertyRegistration`: intenção própria, agenciamento idempotente/responsável preservado, conclusão durável e confirmação de publicação. Não é necessário ID do fornecedor para publicar no canal próprio.

Arquivamento continua nas RPCs `property_retire_request`, `property_archive_finalize`, `property_unarchive`, somente service role. Destinos antigos só são confirmados quando a revisão da intenção de arquivamento coincide. Reativar cadastro não republica automaticamente o Morar. A retirada manual entre simulação e aplicação invalida a aprovação do lote.

Os targets Morar/compostos foram acrescentados ao processamento canônico existente. A operação própria não chama publicação ImobiBrasil diretamente. **Atualizar derivados canônicos pode criar intenções normais de mídia em integrações de provedor já ativas, por gatilhos preexistentes.** Verifique filas antes da ativação; nenhuma delas foi disparada operacionalmente nesta execução.

A aceleração da fila própria usa a RPC existente `property_worker_dispatch`, exclusiva de `service_role`, com o hook fixo `property-image-worker`. Origem HTTPS e segredo são lidos do Vault pelo despachante (`imobi_worker_origin` e `imobi_worker_hook_secret`); a chamada Morar não usa `Host`, cabeçalhos encaminhados ou `request.url` para transmitir credenciais. Falha ou ausência dessa configuração deixa a intenção durável para o cron existente. Verificar `property_worker_dispatch_health` e a configuração do cofre na ativação; não há promessa de processamento imediato.

## Limites da evidência

Todos os caminhos das 4.623 fotos candidatas foram verificados por metadados. A validação visual local usa capas e cinco galerias representativas, com arquivos reais lidos do Gestão. Não equivale a revisar visualmente todos os interiores, marcas, resoluções e ordens antigas. Os 104 grupos de conteúdo duplicado são pendências de análise, não remoção automática.

Foram decodificados 358 arquivos reais, sem falha: todas as capas e cinco galerias completas. Destes, 18 têm largura abaixo de 480 px e 81 abaixo de 960 px. A foto do único destaque atual também tem resolução limitada; o administrador pode escolher outra fotografia autorizada para a entrada. O site preserva os arquivos e marcas existentes. Três Content-Types divergentes são tratados pela assinatura dos bytes, sem aceitar um arquivo arbitrário pelo nome/extensão. Não foi feita revisão binária integral das demais fotos.
