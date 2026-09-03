# Arrastar fotos: mais rápido e com animação

Hoje a reordenação funciona, mas parece pesada: as miniaturas "pulam" de posição sem transição, a lista recarrega do servidor a cada troca e a gravação demora ~0,8s depois de cada movimento.

## O que melhora

### 1. Animação suave ao trocar de posição
- Cada miniatura desliza até o novo lugar (~180 ms), em vez de saltar.
- A foto arrastada ganha destaque: leve elevação, sombra e opacidade, com um espaço claro marcando onde ela vai cair.
- Respeita "reduzir movimento" do sistema (sem animação para quem preferir).

### 2. Arraste mais responsivo
- O item segue o dedo/mouse de imediato (sem esperar o React re-renderizar cada pixel).
- Ao arrastar perto da borda da faixa de miniaturas, a tira rola sozinha para permitir mover a foto para longe.
- Toque no celular fica mais confiável: sem seleção de texto acidental e sem rolagem da página durante o arraste.
- Vibração curta (quando o aparelho suporta) ao encaixar em uma nova posição.

### 3. Salvamento mais rápido e sem "piscar"
- A ordem passa a ser gravada ~350 ms depois da última troca (hoje 800 ms).
- A tela deixa de recarregar a lista de fotos após gravar: a ordem que você vê já é a ordem correta, então acaba o efeito de "sumir e voltar".
- Erro continua desfazendo a mudança e avisando.

### 4. Envio aos sites agrupado
- O reenvio para Cordial/Morar acontece uma única vez ao fim da sessão de organização (agrupando várias trocas), em vez de a cada gravação.

## Detalhes técnicos

- `src/components/imoveis/PhotoSortableGrid.tsx`: adiciona animação FLIP (mede posições antes/depois e anima com Web Animations API), `transform` direto no elemento arrastado via `ref` (sem re-render por movimento), auto-scroll do contêiner, `user-select: none`/`touch-action: none` durante o arraste, `navigator.vibrate` opcional e checagem de `prefers-reduced-motion`. Mantém a API atual (`items`, `onReorder`, `enabled`, `getItemProps`).
- `src/hooks/usePropertyMedia.ts`: debounce de reordenação de 800 → 350 ms; após sucesso, invalida apenas `imovel-detalhe`/`imoveis` (não `property-images`), evitando o reflow da tira; `syncOrderToProviders` passa a ter seu próprio agrupamento (~3 s) para não enfileirar sync repetido.
- `src/components/imoveis/PropertyGallery.tsx` e `PropertyPhotosStep.tsx`: apenas classes/estilos de estado arrastando e contêiner com `ref` para o auto-scroll.
- Sem mudanças de schema, fila, worker, cliente HTTP ou Drive.
