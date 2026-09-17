# Validação final do envio de fotos + transparência do limite dos sites

Objetivo: comprovar com teste real que a ordem interna das fotos está definitivamente correta, e deixar visível no sistema quando o site **não permite** reproduzir uma alteração de galeria que já existe lá. Nenhuma mudança em proprietário, corretor, dados cadastrais ou na pausa de sincronização cadastral.

## O que já está confirmado agora (consulta feita antes deste plano)

- Fotos com erro de envio: **0** (eram 52). Hoje: 7.375 fotos Cordial e 5.028 Morar todas em "enviada".
- 37 publicações passaram pelo novo caminho de mídia e todas ficaram com garantia "quantidade conferida"; **nenhuma** publicação está registrada com divergência de ordem neste momento.
- 828 publicações antigas nunca passaram pelo novo caminho: estão sem métricas de mídia (contagem, ordem, última conferência).
- O painel de publicação do imóvel ainda **não** mostra nada sobre garantia de ordem: quem vê "Ordem salva" não tem como saber que o site pode ter mantido a sequência antiga.

## Parte 1 — Bateria de testes (sem mudar código)

Teste crítico das 30 fotos, em imóvel de teste, pelo navegador automatizado com sessão real:

1. 30 imagens numeradas 01–30 selecionadas de uma só vez; esperar o lote fechar.
2. Conferir no banco: 30 registros, posições 0..29, nenhuma repetida, exatamente uma capa.
3. Ordenar 01 → 30, publicar para Cordial e Morar, conferir quantidade, sequência e capa nas duas galerias.
4. Atualizar a página e reabrir o imóvel: a ordem tem de ser idêntica.
5. Inverter para 30 → 01, esperar "Ordem salva" e o envio, conferir de novo banco, tela e os dois sites.

Demais cenários: uploads simultâneos de 3, 10 e 30 fotos (posições sempre 0..N-1, uma capa); adicionar fotos em imóvel já publicado (confirmar que o envio de mídia dispara sozinho com a pausa cadastral ligada); excluir foto; trocar capa; persistência após refresh, fechar/reabrir e novo carregamento.

Auditoria de segurança em paralelo: registro de cada chamada feita durante os testes, comprovando que o caminho de mídia só usa os recursos de imagem, nunca a alteração cadastral, e que a pausa continua ligada.

## Parte 2 — Estado honesto por site (única mudança de código prevista)

Os sites só oferecem listar e inserir foto. Não há recurso para excluir, reordenar ou trocar o destaque de uma galeria já enviada. Então o sistema deixa de dizer "sincronizado" nesses casos e passa a registrar o motivo:

- **sincronizado** — quantidade e sequência conferem.
- **em andamento** — envio pendente ou em curso.
- **ordem diferente no site** — ordem interna mudou, o site mantém a sequência de inserção.
- **capa diferente no site** — o destaque lá é outro.
- **exclusão não suportada** — foto removida aqui continua no site.

Na tela do imóvel, um aviso discreto ao lado do estado do site: "Ordem salva no Gestão · o site não permite reordenar fotos já publicadas". Sem duplicar imagens para forçar a ordem — isso continua proibido.

## Parte 3 — Entrega

Tabela cenário | Cordial | Morar | banco | resultado | evidência, mais os números antes/depois: posições duplicadas, fotos com erro, publicações com quantidade divergente, publicações com ordem divergente, resultado das 30 fotos e da inversão, comportamento de exclusão, de troca de capa e de fotos novas em imóvel publicado, e a confirmação de que nada de proprietário/corretor foi tocado.

Se algum cenário falhar, volto com a causa antes de mexer em qualquer código além da Parte 2.

## Detalhes técnicos

- E2E via Playwright contra o app local com sessão autenticada; 30 imagens numeradas geradas em disco.
- Conferência em `property_images` (position, is_cover, unique), `property_image_provider_publications` (status, synced_position, content_hash), `property_provider_publications` (media_expected_count, media_synced_count, media_failed_count, media_remote_count, media_order_guarantee, last_media_verified_at), `property_sync_jobs` (só `media_sync`, nenhum `update`).
- Galerias externas conferidas por `GET /imovel/{externalId}/imagem/lista` nos dois provedores.
- Parte 2: novos valores de garantia em `media_order_guarantee` (`remote_order_mismatch`, `remote_cover_mismatch`, `remote_delete_unsupported`) gravados em `media-sync.server.ts` a partir de `planGalleryDelivery`; `PublicationStatusView` em `publish.functions.ts` passa a expor esses campos; `PropertyPublishPanel.tsx` e o indicador de ordem em `PropertyPhotosStep.tsx` exibem o aviso.
- A publicação divergente citada no relatório anterior será reidentificada por consulta durante os testes; se a divergência não for reproduzível hoje, isso é reportado com os dados da consulta em vez de afirmada.
- Sem ação destrutiva: nenhuma foto apagada local ou remotamente para "acertar" galerias antigas.
