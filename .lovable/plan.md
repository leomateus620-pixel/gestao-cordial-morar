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
- Botões do cômodo: **"Tirar foto"** continua com o mesmo nome, mas agora abre a Câmera do app. **"Adicionar da galeria"** continua visível. "Gravar áudio" e "Descrição" não mudam.
- A câmera nativa vira uma opção discreta, **"Usar câmera do celular"**, dentro da Câmera do app. Ela também abre sozinha quando a Câmera do app não funciona.
- Câmera do app em tela cheia: botão de disparo, contador "3 fotos neste cômodo", miniatura da última foto, botão "Concluir", lanterna e zoom só quando o aparelho permitir.
- Antes de pedir a câmera: "Para tirar fotos sem sair da vistoria, permita o uso da câmera."
- Se a permissão for negada ou não houver suporte: "Não foi possível abrir a câmera do app. Use a câmera do celular ou a galeria." Nesse caso, a câmera nativa abre sozinha, como hoje.
- Enquanto uma foto é processada, o botão de disparo fica bloqueado e mostra "Salvando…".
- Aviso de retomada: "O celular fechou a página enquanto a câmera estava aberta (pouca memória) e a foto não chegou. Tente a Câmera do app ou escolha da Galeria." Botão "Entendi".
- Fila: "X fotos aguardando envio · Salvo no aparelho", "Sem internet: as fotos serão enviadas quando a conexão voltar" e "Não foi possível enviar. Tentaremos de novo." Mensagens técnicas do armazenamento deixam de aparecer na tela.
- Foto grande que não deu para converter: "Esta foto é grande demais para este aparelho. Tire de novo pela Câmera do app."
- Espaço no aparelho baixo (menos de 200 MB livres ou mais de 90% da cota usada): "O espaço do navegador está quase cheio. Envie as fotos pendentes antes de continuar."

## Etapas
A) **Câmera dentro do app**: componente novo em tela cheia com câmera traseira.
- Pede o vídeo em 1920x1440 como preferência, sem exigir essa resolução.
- Quando houver `ImageCapture.takePhoto`, limita `imageWidth`/`imageHeight` pelo `getPhotoCapabilities`; senão, tira um quadro do vídeo limitado a 2048 px.
- Toda foto capturada passa pela preparação reduzida (B) antes de ir para a fila.
- Uma captura por vez: o disparo fica bloqueado enquanto a foto é processada. Permite várias fotos seguidas, cada uma pelo caminho de hoje (preparar → `stage` na fila).
- A câmera é desligada ao fechar, ao trocar de aba/ocultar a página e ao sair da tela.
- No computador sem câmera ou em iPhone antigo, o botão cai na câmera nativa.

B) **Menos memória ao preparar a foto**
- Lê o tamanho da imagem pelo cabeçalho JPEG/PNG/WebP (só os primeiros 64 KB) e decodifica já reduzida (`resizeWidth`/`resizeHeight` + `resizeQuality: "high"`).
- Leva em conta a orientação EXIF: nas orientações 5 a 8, troca largura e altura antes de calcular a escala.
- Sem suporte ou com cabeçalho ilegível: decodifica por imagem com decodificação assíncrona e reduz no canvas.
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
- O marcador guarda também um identificador do carregamento da página. Se a pessoa só cancelou a câmera e a página não recarregou, o identificador é o mesmo: o marcador é apagado em silêncio.
- O aviso aparece só depois de uma recarga real (identificador diferente), com marcador de menos de 15 minutos e nenhuma foto nova. Nesse caso, a página volta ao mesmo cômodo e item.
- O marcador é apagado quando uma foto entra na fila, quando a pessoa fecha o aviso ou quando expira.
- O item selecionado passa a ser guardado junto com o cômodo.
- Confirmo pelo teste que os rascunhos (`useDraftRow`) continuam guardando o que foi digitado.

E) **Envio mais resistente**
- Mantém a fila atual: um envio por vez, limite de 5 tentativas e o botão "tentar de novo".
- Continuam iguais o limite de 5 tentativas e a regra de só apagar do aparelho depois do envio confirmado.
- Entre falhas, espera cada vez mais (2 s, 4 s, 8 s, 16 s; até 60 s). Cada registro guarda o horário da próxima tentativa (`nextAttemptAt`).
- A espera não trava a fila: um registro que ainda está esperando é pulado, e as outras fotos continuam sendo enviadas.
- Um único temporizador acorda a fila. Ele é limpo ao sair da tela e ao ocultar a página, e não tenta enviar enquanto estiver sem internet.
- Quando a internet volta ou a pessoa toca "tentar de novo", a espera é ignorada e o envio é tentado na hora.
- O texto técnico do erro fica só no registro interno; na tela aparece a mensagem amigável.
- Áudio: hoje `startRecorder` guarda o som em Float32 a 48 kHz, cerca de 11 MB por minuto, e copia tudo de novo ao gerar o WAV.
  - Passa a reamostrar para 16 kHz em Int16 já durante a gravação, em blocos: cerca de 1,9 MB por minuto.
  - O WAV é montado a partir do cabeçalho e dos blocos, sem nova cópia contínua.
  - Continua sendo uma nota por gravação, sem divisão em partes: 30 minutos ficam em cerca de 57 MB, risco aceitável.
  - O microfone continua sendo liberado ao terminar, cancelar ou ser interrompido.

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
- **Sem mudança (confirmado no escopo):**
  - Fotos dos imóveis: `usePropertyMedia`, `gallery-fallback` e `media-path-rule`.
  - Contratos/conferido e a migração 0114.
  - Competência única de Aluguéis.
  - Sync do Imobi, crons, banco e rotinas do servidor da vistoria.
- **Continua valendo:** o limite de 5 tentativas e a regra de só apagar do aparelho depois do envio confirmado.

## Testes (vitest, em `tests/vistoria` ou junto aos módulos)
- Escala pelo cabeçalho, incluindo fotos com orientação EXIF 6 e 8 (largura e altura trocadas), cabeçalho ilegível caindo no caminho alternativo, e `createImageBitmap` simulado com e sem suporte a redução.
- Miniatura de até 360 px.
- Original aceito até 15 MB JPEG/PNG; recusado acima disso ou em HEIC.
- `useObjectUrls` revoga só o que foi removido e não recria o que não mudou.
- `refresh` com a mesma lista não troca as referências.
- Câmera do app: disparo bloqueado durante o processamento, `takePhoto` com tamanho limitado, e a foto sempre passando pela preparação reduzida.
- Espera entre tentativas: as outras fotos seguem sendo enviadas, o temporizador é limpo ao sair da tela, e a volta da internet ou "tentar de novo" envia na hora.
- Marcador: sem aviso quando é o mesmo carregamento da página (câmera só cancelada); grava antes de abrir, restaura cômodo e item, expira em 15 minutos e é apagado quando a foto chega.
- Câmera do app: encerra a câmera ao fechar, ao ocultar a página e ao sair da tela; cai na câmera nativa quando a permissão é negada ou não há suporte.
- Espera entre tentativas: 2/4/8/16 s, limite de 60 s, para em 5 tentativas.
- Áudio: guarda em 16 kHz Int16, gera um WAV válido (cabeçalho e duração) e libera o microfone.
- Depois de implementar: verificação de tipos (tsc), build de produção e a bateria completa (todas as configurações vitest, `node --test` e testes de banco isolado), citando os 15 de fotos, os de vistoria (`integrity`, `drafts`, `model`, `pdf`, `entry-inspection`), os do PR #51 (`workflow-db`) e os de competência.

## Validação manual (no preview, sem publicar)
- Android/Chrome: 10 fotos seguidas pela Câmera do app; 5 fotos grandes pela galeria; modo avião (ficam na fila e são enviadas ao voltar); recarregar a página com o marcador ativo e conferir o aviso e o cômodo/item.
- iPhone/Safari: as mesmas etapas. O Safari pede permissão da câmera em toda sessão.
- Nenhuma foto vai para uma vistoria real nos meus testes.
- No Playwright, uso câmera falsa e simulo o armazenamento e o registro das fotos: disparo, fila, falha, modo avião e recarga com marcador.
- O teste real no celular fica com você, numa vistoria de teste que você indicar.

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
