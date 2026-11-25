# Vistoria no celular: foto que some ao voltar da câmera

## Diagnóstico (validado no código)
- O aviso "insuficiência de memória" é do Chrome Android: com a câmera nativa aberta (campo de arquivo com captura, `inspection-workspace.tsx` ~1214), o Android fecha a aba; ao voltar, a página recarrega e o navegador descarta a foto. Nenhum código recupera esse arquivo.
- O que aumenta o consumo de memória no nosso código (confirmado):
  - `prepareImage` (`media-client.ts`) decodifica a foto inteira com `createImageBitmap(file)` antes de reduzir para 2048 px.
  - `useLocalQueue.refresh()` roda `listPending` (todos os registros, com os arquivos) antes e depois de cada envio, e `useObjectUrls` recria as URLs de todas as prévias a cada atualização.
  - As prévias que ainda não foram enviadas aparecem em 2048 px, e as já enviadas aparecem em tamanho cheio numa grade de 3 colunas.
  - Se a conversão falhar, o arquivo original é guardado de qualquer jeito, sem limite.
- Hoje o sistema guarda o cômodo aberto (`sessionStorage`), mas não guarda qual item estava selecionado nem que a câmera tinha sido aberta.
- Não precisa de migração nem de alteração de dados. O registro no banco (`registerMedia`), o caminho dos arquivos, o bucket e a regra de só apagar do aparelho depois do envio confirmado continuam iguais.

## O que muda para o usuário (textos)
- Botões do cômodo: **"Câmera do app"** (principal no celular), **"Câmera do celular"** (a de hoje) e **"Adicionar da galeria"**.
- Câmera do app em tela cheia: botão de disparo, contador "3 fotos neste cômodo", miniatura da última foto, botão "Concluir", lanterna e zoom só quando o aparelho permitir.
- Antes de pedir a câmera: "Para tirar fotos sem sair da vistoria, permita o uso da câmera."
- Se a permissão for negada ou não houver suporte: "Não foi possível abrir a câmera do app. Use a câmera do celular ou a galeria." A câmera nativa abre como hoje.
- Aviso de retomada: "O celular fechou a página enquanto a câmera estava aberta (pouca memória) e a foto não chegou. Tente a Câmera do app ou escolha da Galeria." Botão "Entendi".
- Fila: "X fotos aguardando envio · Salvo no aparelho", "Sem internet: as fotos serão enviadas quando a conexão voltar" e "Não foi possível enviar. Tentaremos de novo." Mensagens técnicas do armazenamento deixam de aparecer na tela.
- Foto grande que não deu para converter: "Esta foto é grande demais para este aparelho. Tire de novo pela Câmera do app."
- Espaço no aparelho baixo (menos de 200 MB livres ou mais de 90% da cota usada): "O espaço do navegador está quase cheio. Envie as fotos pendentes antes de continuar."

## Etapas
A) **Câmera dentro do app**: componente novo em tela cheia com câmera traseira.
- Captura a foto pela função própria de foto do navegador quando houver; senão, tira um quadro do vídeo limitado a 2048 px.
- Permite várias fotos seguidas. Cada foto passa pelo mesmo caminho de hoje (preparar → `stage` na fila), uma de cada vez.
- A câmera é desligada ao fechar, ao trocar de aba/ocultar a página e ao sair da tela.
- No computador sem câmera ou em iPhone antigo, o botão cai na câmera nativa.

B) **Menos memória ao preparar a foto**
- Lê o tamanho da imagem pelo cabeçalho JPEG/PNG/WebP (só os primeiros 64 KB) e decodifica já reduzida (`resizeWidth`/`resizeHeight` + `resizeQuality: "high"`).
- Sem suporte: decodifica por imagem com decodificação assíncrona e reduz no canvas.
- Usa canvas fora da tela quando houver.
- Sempre libera a imagem decodificada e zera o canvas. Nunca usa base64.
- Gera também uma miniatura de 360 px (JPEG 0,7).
- Original sem conversão só se for JPEG/PNG de até 15 MB; acima disso, mostra o aviso amigável.

C) **Fila e prévias**
- `refresh` deixa de recriar tudo: compara por chave, status e tentativas, e mantém o mesmo arquivo para cada chave.
- `useObjectUrls` passa a trabalhar por partes: cria URL só para chave nova e revoga só a que saiu.
- A prévia pendente usa a miniatura; registros antigos sem miniatura usam o arquivo, como hoje.
- Fotos já enviadas: primeiro checo se o armazenamento aceita versão reduzida na assinatura (`transform` com largura de 400). Se aceitar, uso a miniatura; se não, uso `width`/`height`, `loading="lazy"` e `decoding="async"`. A foto cheia aparece só no visualizador.
- A miniatura fica como campo opcional no mesmo registro do aparelho, sem mudar a versão do armazenamento local.

D) **Retomada**
- Antes de abrir a câmera nativa ou a galeria, grava no aparelho `{usuário, vistoria, cômodo, item, origem, hora}`.
- Ao abrir a página com um marcador de menos de 15 minutos e sem foto nova desde então: volta ao mesmo cômodo e item e mostra o aviso.
- O marcador é apagado quando uma foto entra na fila, quando a pessoa fecha o aviso ou quando expira.
- O item selecionado passa a ser guardado junto com o cômodo.
- Confirmo pelo teste que os rascunhos (`useDraftRow`) continuam guardando o que foi digitado.

E) **Envio mais resistente**
- Mantém a fila atual: um envio por vez, limite de 5 tentativas e o botão "tentar de novo".
- Entre falhas, espera cada vez mais (2 s, 4 s, 8 s, 16 s; até 60 s) e não tenta enquanto estiver sem internet.
- O texto técnico do erro fica só no registro interno; na tela aparece a mensagem amigável.
- Áudio: hoje `startRecorder` guarda o som em PCM na memória, cerca de 11 MB por minuto em 48 kHz. Limite de 10 minutos por segmento: depois disso, salva e começa outro segmento automaticamente. O microfone continua sendo liberado ao terminar, cancelar ou ser interrompido.

F) **Armazenamento**: pede `navigator.storage.persist()` uma vez por aparelho e mostra o aviso quando o espaço estiver baixo.

## Arquivos
- **Criar:**
  - `src/lib/vistoria/image-prepare.ts` (cabeçalho, escala, decodificação reduzida, miniatura, limite do original)
  - `src/lib/vistoria/capture-resume.ts` (marcador)
  - `src/lib/vistoria/retry-backoff.ts`
  - `src/lib/vistoria/storage-persist.ts`
  - `src/components/vistoria/in-app-camera.tsx`
- **Alterar:**
  - `media-client.ts` (`prepareImage` delega a `image-prepare`; segmentos de áudio)
  - `local-store.ts` (campo opcional `thumb`)
  - `use-inspection.ts` (`refresh` por diferença, espera entre tentativas, `useObjectUrls` incremental, mensagens)
  - `inspection-workspace.tsx` (botões, marcador, item guardado, avisos)
  - `photos.tsx` (miniaturas, lazy)
  - `AGENTS.md` (regra: câmera do app primeiro, marcador de retomada, prévia só por miniatura)
- **Sem mudança:** fotos dos imóveis (`usePropertyMedia`, `gallery-fallback`, `media-path-rule`), contratos e a 0114, competência única, rotinas do servidor da vistoria, banco e crons.

## Testes (vitest, em `tests/vistoria` ou junto aos módulos)
- Escala pelo cabeçalho, e `createImageBitmap` simulado com e sem suporte a redução.
- Miniatura de até 360 px.
- Original aceito até 15 MB JPEG/PNG; recusado acima disso ou em HEIC.
- `useObjectUrls` revoga só o que foi removido e não recria o que não mudou.
- `refresh` com a mesma lista não troca as referências.
- Marcador: grava antes de abrir, restaura cômodo e item, expira em 15 minutos e é apagado quando a foto chega.
- Câmera do app: encerra a câmera ao fechar, ao ocultar a página e ao sair da tela; cai na câmera nativa quando a permissão é negada ou não há suporte.
- Espera entre tentativas: 2/4/8/16 s, limite de 60 s, para em 5 tentativas.
- Áudio: divide em 10 minutos e libera o microfone.
- Depois de implementar: verificação de tipos (tsc), build de produção e a bateria completa (todas as configurações vitest, `node --test` e testes de banco isolado), citando os 15 de fotos, os de vistoria (`integrity`, `drafts`, `model`, `pdf`, `entry-inspection`), os do PR #51 (`workflow-db`) e os de competência.

## Validação manual (no preview, sem publicar)
- Android/Chrome: 10 fotos seguidas pela Câmera do app; 5 fotos grandes pela galeria; modo avião (ficam na fila e são enviadas ao voltar); recarregar a página com o marcador ativo e conferir o aviso e o cômodo/item.
- iPhone/Safari: as mesmas etapas. O Safari pede permissão da câmera em toda sessão.
- Playwright no computador: câmera falsa do Chromium para disparo e encerramento, e simulação de falha de envio.
- Uso uma vistoria de teste. As fotos vão para o banco compartilhado: só faço isso com o seu OK e numa vistoria indicada por você.

## Riscos
- Algumas câmeras de Android entregam pelo navegador uma resolução menor que a câmera nativa. Peço 1920x1440 ou mais, e a câmera nativa continua disponível.
- Lanterna e zoom só aparecem onde o aparelho deixar.
- A Câmera do app reduz a chance de a página ser fechada, mas a câmera nativa continua sujeita a isso; o marcador só avisa.
- Versão reduzida do armazenamento pode não estar ativa; nesse caso uso o caminho alternativo acima.

## Como desfazer
- Tudo é código de tela e do navegador, sem migração: basta voltar o commit.
- O campo de miniatura é opcional e registros antigos continuam funcionando.
- O marcador e a permissão de armazenamento ficam só no aparelho e podem ser ignorados.

Nada será publicado.
