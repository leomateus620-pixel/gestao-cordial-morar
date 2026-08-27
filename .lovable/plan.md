# Marca-d'água obrigatória nas fotos de imóveis

## O que já existe (auditoria)

- Etapa 6 do cadastro: `PropertyPhotosStep.tsx` + `usePropertyMedia.ts`. O navegador calcula o SHA-256, pede uma URL assinada (`createPropertyImageUploadUrl`), envia direto para o bucket privado `property-images` e registra a foto (`registerPropertyImage`).
- Tabela canônica: `property_images` (`storage_path`, `content_hash`, `position`, `is_cover`, `upload_status`, `width`, `height`, `mime_type`, `size_bytes`). Não há campo de original/derivada nem de marca.
- Publicação: `src/lib/imobibrasil/sync.server.ts` baixa `storage_path` do Storage e envia em multipart para `/imovel/{id}/imagem/inserir`, registrando resultado em `property_image_provider_publications` (idempotência por `content_hash`). Hoje ele envia a foto original, sem marca.
- Fila persistente já existente: `property_sync_jobs` + `property_sync_claim_jobs` (lease/lock) + worker HTTP `/api/public/hooks/property-sync-worker` chamado pelo pg_cron. O pipeline de marca vai reutilizar esse mesmo padrão, sem criar infraestrutura paralela.
- Não existe hoje nenhum tratamento de EXIF, redimensionamento ou thumbnail: será criado dentro do novo pipeline.
- Destino (Cordial / Morar) hoje só existe como estado de tela no cadastro (`destinos`) e vira `property_provider_publications` no momento de publicar — precisa ser persistido no imóvel para o pipeline saber qual marca aplicar.
- Runtime: o backend roda em Worker (Cloudflare), não em Node. `sharp` não funciona. A composição será feita com biblioteca WASM compatível com Worker (Photon/jSquash), validada no runtime real antes de fechar.

## Marcas

A logo enviada (1920×1920, PNG com alpha real, marcas brancas) contém MORAR em cima e Cordial embaixo. Serão gerados uma única vez três templates versionados, com recorte apenas sobre transparência e margem de segurança:

- `watermark-morar-v1.png` (símbolo + MORAR + IMÓVEIS)
- `watermark-cordial-v1.png` (símbolo + Cordial + IMÓVEIS)
- `watermark-morar-cordial-v1.png` (composição completa, inalterada)

Cada um será mostrado sobre fundo claro, escuro e fotografia para validação visual antes de seguir. Sem redesenho, revetorização ou troca de tipografia.

## Regra de negócio

| Destino do imóvel | Marca aplicada |
| --- | --- |
| Só Cordial | Cordial |
| Só Morar | Morar |
| Cordial + Morar | Composição completa (uma única versão enviada aos dois sites) |

Vale para capa e todas as fotos. Trocar o destino regenera todas as derivadas a partir do original, marca a versão anterior como substituída e cancela jobs pendentes com hash de destino antigo.

## Composição visual

Config central versionada (`watermark-config.ts`): canto inferior direito, margem ≈2,5% da menor dimensão (mín. 18 px), largura 13–15% da foto (16–18% na combinada) com limites mín./máx. em px, opacidade 82–88%, aspect ratio preservado, sem mosaico e sem faixa. Contraste garantido por sombra escura curta e suave ou scrim discreto atrás da marca — a escolha final sai da validação visual em seis fotos representativas (clara, escura, retrato, paisagem, panorâmica, quase quadrada). Sem controles por foto para o corretor.

## Backend

1. **Migration retrocompatível** em `property_images`: `original_storage_path`, `processed_storage_path`, `thumbnail_storage_path`, `original_checksum`, `processed_checksum`, `watermark_variant`, `watermark_version`, `destination_hash`, `processing_status`, `processing_error_code`, `processed_at`. Registros antigos ficam com `watermark_variant = null` e não são erro. Índice único garantindo uma variante ativa por imagem + destino. Grants e RLS mantidos no padrão atual (leitura só por quem já enxerga o imóvel; service role só no backend).
2. **Persistir o destino** do imóvel (alvos de publicação) para que o pipeline e a validação saibam qual variante é a correta, e recalcular `destination_hash` quando ele muda.
3. **Fila de processamento** reutilizando o padrão `property_sync_jobs`: tabela de jobs de imagem com lease, tentativas, backoff, limite de lote e status terminal acionável (dead-letter). Worker em rota `/api/public/hooks/property-image-worker`, protegido por segredo compartilhado, acionado no upload e pelo pg_cron.
4. **Processador**: valida MIME real/assinatura/dimensões/bytes e limite anti-decompression-bomb, corrige orientação EXIF, normaliza para sRGB, remove GPS, compõe a variante correta, gera JPEG final (qualidade 88–92) e thumbnail separada, calcula checksums e grava em paths distintos do original. Chave idempotente = imagem + variante + versão do template + parâmetros: se já existir resultado íntegro, reutiliza (retry nunca marca duas vezes). Processa sempre a partir do original privado.

## Etapa 6

- Rascunho criado antes do primeiro upload (comportamento atual preservado).
- Status por foto: Enviando → Aplicando marca → Pronta / Erro, com preview substituído pela versão marcada e prévia ampliada para conferência.
- Ordenação, capa, remoção e persistência entre etapas mantidas; só as fotos em processamento ficam bloqueadas.
- Retry individual e "Tentar novamente todas"; resumo discreto ("12 de 12 fotos prontas com as marcas Morar + Cordial"); aviso "Atualizando marcas nas fotos…" durante regeneração. Nenhum termo técnico na tela.
- Antes de "Cadastrar e publicar": bloqueio se alguma foto não estiver `ready`, com variante do destino atual, versão vigente do template, exatamente uma capa e arquivo final válido. Falhas são listadas por foto.

## Publicação

`sync.server.ts` passa a baixar e enviar `processed_storage_path` (nunca o original), usando `processed_checksum` na idempotência. Ordem e capa preservadas, ID/URL externo associado à imagem local, reconciliação de quantidade/ordem depois do envio, falha em um provedor não bloqueia o outro e fotos já confirmadas não são reenviadas. No cenário combinado, os dois sites recebem exatamente o mesmo arquivo.

## Segurança e observabilidade

Tokens só no backend; logs com correlation ID, imagem, destino, variante, versão, duração e erro sanitizado — nunca bytes, token ou signed URL. Métricas de fila pendente, tempo de processamento, falhas e retries. Retry administrativo regenera do original. Atualizar o template não reprocessa o acervo: rollout é operação administrativa explícita e separada.

## Testes

Unitários da escolha de variante, escala/posicionamento e idempotência; integração do worker (upload → marca → publicação) com Cordial só, Morar só e ambos; troca de destino regenerando e invalidando job antigo; retry sem dupla marca; bloqueio de publicação com foto pendente; rejeição de MIME falso/arquivo inválido; RLS cruzada. E2E de etapa 6 em desktop e mobile. Fecho com comparação visual em seis fotografias reais e build/lint/typecheck/migrations verdes no runtime de produção.

## Entrega

Templates validados visualmente, migration, worker de processamento, integração com etapa 6 e com o worker Cordial/Morar, testes e resumo final dos arquivos, migrations, filas e funções alteradas.
