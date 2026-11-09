# Galeria dos 5 destaques da home (Cordial e Morar)

## Hipótese principal (a confirmar na reprodução)
As setas dos cards são posicionadas com `transform: translateY(-50%)`. A regra geral dos botões de ícone aplica `transform: scale(0.95)` ao pressionar, o que **substitui** o deslocamento: no instante do clique a seta "pula" ~18–22 px para baixo. O botão do mouse é solto fora da seta (sobre o link da foto), então o navegador não gera o clique no botão e `move()` não é chamado. Enter/Espaço não sofrem isso — a reprodução vai diferenciar mouse x teclado para confirmar.

Outros pontos já vistos no código:
- O `HomeCard` passa ao `<PropertyImage>` o `sizes` fixo do mosaico, e não `photos.imageSizes`; a foto preparada pode não ser a que o navegador exibe (download duplo / atraso).
- Até 420 px as setas dos cards pequenos e compactos ficam escondidas (`display: none`) — sem controle acessível nesses tamanhos.
- No desktop as setas ficam com opacidade 0 fora do hover; o foco por teclado só as mostra via `:focus-visible` dentro da área da foto (ok), mas precisa ser conferido.
- A captura de swipe só suprime clique após gesto horizontal com `detail !== 0`; manter, mas limpar o estado também no cancelamento.

## Etapa 1 — Reproduzir e registrar
- Playwright na prévia (desktop 1366 e celular 390/360), home Cordial e Morar, refs 1398/1401 ou equivalentes (1 grande + 1 pequeno).
- Logs temporários (removidos ao final): alvo do pointerdown/up, clique no botão, clickCapture do swipe, chamada de `move()`, URL pedida e `currentSrc` após `load`.
- Comparar mouse no ícone e na borda, toque, Enter, Espaço; logo ao ficar visível e com cache. Registrar onde a troca para e capturar print "antes" com contador.

## Etapa 2 — Corrigir acionamento
- Setas: posicionar sem depender de `transform` (ex.: `top: calc(50% - h/2)`) e escopar o efeito de pressionar para não mover a área; ícone com `pointer-events: none`; z-index acima do link e abaixo do favorito; mesma área no hover e no foco; seta visível com `:focus-visible`.
- Swipe: suprimir só o clique do mesmo gesto horizontal; limpar estado em `pointercancel`/`pointerup` sem troca; nunca suprimir clique nas setas ou favorito; manter `touch-action: pan-y`.
- Até 420 px: em vez de esconder, setas menores (área de toque ≥ 32 px) nos cards pequenos/compactos, sem cobrir preço/infos; toque na foto continua abrindo a ficha.

## Etapa 3 — Foto correta e transição
- `HomeCard` passa `photos.imageSizes` para a imagem, alinhado ao pré-carregamento.
- Conferir em `useCardPhotos`: foto atual mantida até a nova carregar, contador muda junto, intenção mais recente vence, falha mantém a foto e permite nova tentativa, primeira/última e cards de 1 foto.
- Transição curta (opacidade ~120 ms) só depois da imagem pronta, desligada com movimento reduzido.
- Manter antecipação de uma vizinha por card prioritário com `card-gallery.ts`/`card-photo-preload.ts`; checar que o destaque grande e os pequenos baixam variantes de tamanho adequado e que as capas seguem prioritárias.

## Etapa 4 — Validação
- Cenários da tabela pedida (grande, pequeno, celular/tablet, rede lenta simulada, falha e cliques alternados), nas duas marcas, em 1366, 768, 390 e 360 px; URL e rolagem inalteradas.
- Medir acionamento→imagem visível com foto preparada (meta 300 ms) e sem preparo.
- Regressão: resultados de busca Cordial e vitrine Morar.
- Rodar test:site, test:morar e checagem de tipos.
- Entrega: problema reproduzido, causa confirmada, arquivos alterados, cenários, tempos e prints antes/depois com contador. Sem publicar.

## Arquivos previstos
`site.css` (e `morar.css` se necessário), `CardPhotoControls.tsx`, `useCardPhotos.ts`, `HomePage.tsx`.
