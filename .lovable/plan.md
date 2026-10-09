# Fotos: parar a perda, destravar os envios e corrigir a ordem

## O que já está confirmado no código
- `gallery-plan.ts` linhas 171–180 (`sendOrderForSite`): envia a capa primeiro e depois as demais em ordem **decrescente** de posição. Essa regra parte da ideia de que "o site mostra cada foto nova logo depois da capa" (comentário em `media-sync.server.ts` linha ~508).
  - O que você mediu no 1377 C mostra o contrário: o site exibe a capa e, depois dela, as fotos em ordem **crescente de envio**. Isso explica a ordem invertida.
  - O 1406 C, enviado antes da correção, está certo. Isso indica que o fluxo antigo enviava em ordem crescente. Vou confirmar no primeiro passo, comparando com o histórico do arquivo.
- `media-sync.server.ts` linhas 516–541 ("deslocadas"):
  - Apaga do site as fotos já enviadas que ficariam antes de uma foto pendente e as marca como `delete/reorder_reset`.
  - Isso acontece **antes** de reenviar qualquer coisa.
  - Exige só `gallery.reliable` naquele instante. Não há limite de quantidade nem conferência posterior.
  - É o caminho que esvaziou o 3378 M.
- `media-rebuild.server.ts` linha ~250: a reconstrução apaga as fotos (`rebuild_delete`) e só depois reinsere. É o mesmo padrão de apagar primeiro, e foi o que aconteceu no 1401 C e no 3398 M.
- `media-sync.server.ts` linha ~924: `ordem_confirmada_por_leitura` sai quando a leitura é confiável e todas as fotos estão `synced`. A ordem nunca é comparada com o que o site exibe. Por isso a ordem errada foi aprovada.
- **Ainda sem confirmação** (é o primeiro passo da implementação, só com leituras):
  - a causa de nenhuma inserção ter sido confirmada desde 00h de 09/10;
  - por que o casamento por `before_codes`/`at` não reconheceu as fotos do 3371 M e do 1372 C;
  - a capa errada do 1404 C.

## Passo 0 — Diagnóstico só de leitura, antes de qualquer mudança
- Leio no banco: `property_sync_attempts`/logs de `media_sync` de 08/10 18h até 09/10 06h, com status HTTP, tempo, mensagem e `correlation_id` de `/imagem/inserir` e `/imagem/lista`.
- Comparo `verification.before_codes` com a galeria real (GET `/imagem/lista` e a página pública) do 3371 M, do 1372 C, do 1401 C, do 3398 M e do 1404 C.
- Hipóteses que vou testar:
  - o envio expira (90 s) depois de a foto ter chegado ao site, e por isso fica `delivery_unknown`;
  - `resolveUnknownDeliveries` exige pelo menos 2 desconhecidas e códigos só numéricos, então uma desconhecida isolada com código não numérico, ou com `before_codes` que já incluía outros órfãos, nunca casa;
  - a lista vem vazia ou parcial e é tratada como confiável.
- Comparo a ordem de `/imagem/lista` com a da galeria pública e defino a regra real: ordem de inserção crescente, com o destaque na frente.
- O resultado vem para você antes dos passos 2 e 3. Se a causa for outra, ajusto o plano.

## 1. Perda de fotos: nunca apagar antes de repor
- **Enviar primeiro, apagar depois:**
  - No caminho das "deslocadas" e na reconstrução, a foto substituta é enviada e confirmada por uma nova leitura confiável. Só depois a cópia antiga sai do site.
  - Se a ordem só puder ser corrigida apagando antes, a rodada **não apaga nada**: a publicação fica em atenção, com a mensagem "ordem diferente no site — use Reconstruir galeria".
- **Sem leitura confiável, nada é apagado:**
  - Antes de cada exclusão, a galeria do início da rodada precisa ser confiável, não vazia e coerente com os vínculos. Se a contagem cair de forma inesperada entre leituras, é inconsistente.
  - Leitura inconclusiva, demorada, vazia ou incoerente bloqueia todas as exclusões da rodada e marca atenção.
- **Limite e disjuntor:**
  - Máximo de 2 exclusões por rodada, por imóvel e por site.
  - A rodada guarda a contagem de fotos do site no início da recuperação, no checkpoint. Se o site cair abaixo de 80% desse número, as exclusões ficam bloqueadas até ação manual.
  - Só aceitam exclusão as fotos duplicadas ou sem vínculo cuja substituta já foi confirmada.
- **Registro para auditoria:**
  - Cada rodada grava, no log de tentativas: imóvel, site, `correlation_id`, fotos no site antes e depois, apagadas, enviadas, confirmadas, incertas e o motivo de bloqueio.
  - O registro usa o `logAttempt` que já existe, com o JSON no campo de detalhes. Não precisa de coluna nova.

## 2. Envios parados
- A correção depende do Passo 0. Já entra no plano:
  - **Casamento de entrega incerta:**
    - Também com uma única desconhecida: a foto é adotada se houver exatamente um código novo no site, fora de `before_codes`, e sem vínculo.
    - Com várias desconhecidas, a regra atual continua, mas aceita códigos não numéricos ordenando pela posição na lista.
    - Sem evidência única, nada é adotado.
  - **Inserção que expira:** é relida antes de virar incerta, para não deixar uma foto que já chegou como incerta.
  - **Entrega incerta não trava o resto:** uma foto incerta não bloqueia as próximas quando já foi resolvida, e a próxima rodada resolve antes de enviar.

## 3. Ordem no site
- `sendOrderForSite` passa a enviar em ordem **crescente** de posição (capa primeiro). A regra fica num só lugar e é usada pelo envio normal e pela reconstrução.
- **Nova conferência de ordem:**
  - Compara a sequência da galeria lida, com o destaque primeiro e o restante na ordem exibida, com a ordem do Gestão.
  - Só marca `ordem_confirmada_por_leitura` se a sequência for igual e houver exatamente uma capa, que precisa ser a 1ª foto do Gestão.
  - Se for diferente, fica `ordem_divergente`, e a rodada não apaga nada sozinha (item 1).
- **Capa:**
  - Continua a regra de nunca criar uma segunda capa.
  - Se a capa estiver errada, como no 1404 C, a correção acontece só pela "Reconstruir galeria" manual: primeiro envia a capa nova, depois retira a antiga.

## 4. Recuperação (só depois do publish e da sua aprovação, um imóvel por vez)
- **Ordem dos imóveis:**
  1. 3378 M
  2. 1401 C
  3. 3398 M
  4. 1404 C
  5. Os invertidos: 1377 C, 1372 C, 3371 M, 1399 C, 1385 C e 3393 M.
- **Como cada um é recuperado:** pelo botão "Reenviar fotos" ou "Reconstruir galeria".
  - Casa as fotos com a galeria real pelo código de cada imagem.
  - Envia só as que faltam, na ordem do Gestão.
  - Só depois retira as fora de ordem, até 2 por rodada.
- **Acompanhamento:** o card da publicação mostra as fotos no site antes → agora, as do Gestão, a capa e as apagadas/enviadas na última rodada.
- **Parada automática:** se a contagem do site cair abaixo de 80% do início, ou houver 3 rodadas sem confirmar envio, a recuperação para e pede atenção.

## 5. Proteção até o publish (só descrita, nada aplicado)
- Opção barata e segura: uma flag `media_delete_block` na tabela de controle de recuperação que já existe. A rodada só apagaria fotos com essa flag desligada.
  - Isso exige mudar o código, então só passa a valer depois do publish. Não protege antes.
- Antes do publish, sem mudar código, a única forma é parar os jobs `media_sync` dos 4 imóveis afetados (adiar `next_run_at`). Isso é uma alteração de dados e só seria feita com a sua autorização.
  - O sync da Imobi não é pausado.
  - Os envios cadastrais seguem normais.

## Testes
- Não apaga quando a leitura falha, é inconclusiva, vazia ou incoerente.
- Não apaga antes de a foto substituta ser confirmada por uma nova leitura.
- Máximo de 2 exclusões por rodada, e o disjuntor dos 80% bloqueia.
- Envio em ordem crescente: a ordem final simulada do site é igual à do Gestão, com uma única capa, a 1ª do Gestão.
- A conferência recusa ordem invertida e capa errada.
- Entrega incerta: uma única é adotada com evidência única; com várias, só há casamento exato; evidência ambígua não adota nada.
- `recoverPropertyMedia` recusa quem não é administrador, tanto em "Reenviar fotos" quanto em "Reconstruir galeria", com dublê do backend.
- Suíte completa e typecheck, sem regressão em: endereço/complemento, reserva de códigos 1406/3405, fallback JS da marca d'água do 1385 e NFS-e.

## Arquivos
- **Alterados:** `media-sync.server.ts`, `media-rebuild.server.ts`, `gallery-plan.ts`, `gallery-rebuild.ts`, `media-recovery-rules.ts`, `image-ops.server.ts`, `PropertyPublishPanel.tsx`, `package.json`.
- **Novos:** `gallery-order-check.ts` e testes, e `media-recovery.functions.test.ts`.

## Migração e riscos
- **Não precisa de migração.** O contador do disjuntor fica no `media_rebuild_state` (JSON), e o log vai no registro de tentativas.
- A flag do item 5 só seria criada se você escolher essa opção. Seria aditiva: `ALTER TABLE property_provider_recovery_circuit ADD COLUMN media_delete_blocked boolean DEFAULT false;`
- **Passos que podem apagar foto em produção:**
  - só as rodadas de recuperação depois do publish, sempre depois de a foto substituta ser confirmada, até 2 por rodada e com o disjuntor ativo;
  - a "Reconstruir galeria" manual.
- Nada é apagado durante a implementação nem nos testes.

## Restrições confirmadas
- Não publico.
- Não aciono recuperação.
- Não altero dados.
- Não pauso o sync.
- Não toco em NFS-e, locação nem no PR #29.
