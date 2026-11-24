# Fotos sumidas no Gestão + regra de caminho nas listas dos sites

## O que já foi confirmado (só leitura, nesta conversa)
- A ficha monta a galeria em `_app.imoveis.$imovelId.index.tsx` (linha ~142) a partir de `media.gallery.data`, que depende da fila de ordem.
- `media.functions.ts` (`signImages`, linha ~90) gera miniatura por transformação (480x480) e, se não houver, cai para a URL inteira (linha ~106).
- Última migração existente: **0112**. A próxima será **0113**.
- A regra `(^https?:|\.\.)` existe em `0002_morar_owned_site.sql` e em outras (vídeo, 0025). As views atuais serão lidas por inteiro antes de recriar.
- Imóvel Morar 3454: lote 1 (18:52 UTC) com 1 foto, **completo**. Lote 2 (19:01:55 UTC): 15 esperadas, 15 falhas, marcado `incomplete` 7 s depois, sem reserva. A tabela não guarda o texto do erro, então a causa **ainda não está confirmada**.

## 1. Ficha e etapa Fotos: nunca esconder foto ativa
- Nova função pura `resolveGalleryPhotos(activeImages, queueKeys, mediaPhotos)` em `src/lib/imoveis/gallery-fallback.ts`:
  - Fila completa (todas as fotos ativas têm chave): mantém a ordem e a capa novas do PR #50.
  - Fila vazia ou incompleta: as fotos com chave mantêm a ordem da fila, e as que faltam entram depois, por `position`. Se não houver nenhuma chave, vale a ordem `position` com a capa na posição 0.
  - Regra fixa: o número de fotos exibidas é igual ao número de fotos ativas.
- Arquivos alterados:
  - `src/routes/_app.imoveis.$imovelId.index.tsx`: passa a usar a função nova em vez de `media.gallery.data ? … : imovel.images`.
  - `src/hooks/usePropertyMedia.ts`: expõe a lista combinada, e a etapa Fotos usa a mesma lista.
  - `src/components/imoveis/PropertyPhotosStep.tsx`: usa a mesma lista; arrastar e definir capa continuam gravando pela fila atual.
- Miniatura: em `media.functions.ts` (`signImages`), foto sem `thumbnail_storage_path` (legacy) recebe `thumbUrl = url` (foto inteira), sem transformação. Isso evita depender de um serviço de imagem que pode estar indisponível. O custo é mais tráfego nas fotos antigas.
- Rede de segurança: `PropertyGallery.tsx` e `PropertyPhotosStep.tsx` ganham um `onError` que troca, uma única vez, a miniatura pela foto inteira.

## 2. Migração 0113: regra de caminho nas views
- Arquivo `0113_authorized_media_path_rule.sql`: só `CREATE OR REPLACE VIEW` de `cordial_site_authorized_media` e `morar_site_authorized_media`.
  - A definição atual é copiada sem mudança e só a expressão é trocada por: `storage_path ~* '^https?:' OR storage_path ~ '(^|/)\.\.(/|$)'`.
  - Mesmas colunas, mesma ordem e mesmas permissões. Não toca em dados, assinaturas, gatilhos nem nas funções de vídeo.
  - Se a mesma regra estiver em alguma função usada pelas views, ela é listada, e fica para você decidir se entra.
- Teste no banco, numa transação desfeita no final: 1444/3441 aparece nas duas views, e os caminhos `../x`, `a/../b`, `..` e `https://…` continuam bloqueados.

## 3. Investigação do 3454 (antes de qualquer correção)
- Ler os registros do servidor perto de 19:01:55 UTC para `openPropertyImageBatch`, `createPropertyImageUploadUrl` e `reportPropertyImageBatchFailure`.
- Ler os registros do storage (envio para `originais/galeria-…`, RLS) e o código de `prepareImageForUpload`.
- Comparar o caminho de envio entre os PRs #50 e #51 (git diff).
- Resultados possíveis:
  - **Bug:** a correção mínima entra no plano já aprovado, com um teste, e eu te aviso antes.
  - **Arquivo ou conexão do usuário (formato HEIC, rede):** eu te informo e não altero nada.
- Sinal já visto: o primeiro envio do mesmo imóvel funcionou 10 minutos antes. Isso enfraquece a hipótese de permissão e reforça erro no preparo das 15 fotos ou na criação dos endereços de envio.

## Testes (vitest)
- `gallery-fallback.test.ts`:
  - Fila vazia: mostra todas, em ordem `position`, com a capa correta.
  - Fila incompleta: nenhuma some; as fotos com chave vêm antes.
  - Fila completa: mantém a ordem e a capa novas.
- Teste da miniatura: foto legacy usa a URL inteira; foto com miniatura gravada usa a miniatura.
- `path-rule.test.ts`: espelha a expressão da migração.
  - Bloqueia: `../x`, `a/../b`, `a/..`, `..`, `https://x`, `HTTP://x`.
  - Permite: `.../originais/<uuid>-full...jpg`, `a..b.jpg`.
- Testes atuais de imóveis, cordial-site e site-showcase: rodar e confirmar que nada quebrou.

## Validação no preview (Playwright, com login)
- Ficha de um imóvel Cordial só-legacy e de um Morar só-legacy: fotos e miniaturas aparecem.
- Imóvel com fila nova: ordem e capa mantidas; arrastar e definir capa gravam e continuam após recarregar.
- Etapa Fotos do cadastro: mesmo número de fotos que no banco.
- Consulta de leitura: o 1444/3441 aparece em `*_site_authorized_media`, e a contagem de elegíveis não cai.

## Sem regressão (não será tocado)
- Fila e reserva de envio, marca-d'água, processador e despachante de fotos (incidente do 1385).
- Assinaturas aprovadas, sync Imobi e crons.

## Riscos e como desfazer
- **Ordem da junção:** só muda a tela; desfazer = reverter o commit. Os dados não mudam.
- **Foto inteira como miniatura:** a ficha fica mais pesada nas fotos legacy; desfazer = reverter o commit.
- **0113:** um caminho com `..` no nome passa a ser aceito. Os caminhos de pasta (traversal) continuam bloqueados, e o storage já é privado e assinado. Desfazer = migração 0114 com a expressão antiga.

## Futuro (precisa de OK separado)
- Gerar miniaturas em massa para as ~11.448 fotos legacy.

## Perguntas
1. A 0113 fica restrita às duas views, ou entra também a regra igual nas funções de vídeo (0025)? A minha sugestão é só as views.
2. Se o 3454 for problema do arquivo, devo só te informar ou também melhorar a mensagem de erro na tela?
