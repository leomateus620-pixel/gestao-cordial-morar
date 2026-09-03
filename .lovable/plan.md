# Arrastar fotos: trocar de lugar na hora, sem espera

Analisei o fluxo atual (`PhotoSortableGrid.tsx`, `usePropertyMedia.ts`, ficha e Etapa 6). Existem dois problemas distintos e ambos têm causa confirmada no código.

## Problema 1 — a foto quase não "pega" a nova posição

Enquanto você arrasta, a miniatura escolhida acompanha o dedo/mouse e fica **por cima** de todas as outras. Para decidir onde soltar, o código pergunta "qual foto está embaixo do ponteiro?" — e a resposta é sempre a própria foto arrastada. Resultado: a troca só acontece quando o ponteiro escapa da miniatura, o que dá a sensação de que não está puxando.

**Correção:** decidir a posição pela geometria da faixa (comparar o centro do ponteiro com o centro de cada miniatura vizinha) em vez de perguntar "o que está embaixo". A troca passa a acontecer assim que você cruza metade da foto vizinha, na hora, tanto na tira horizontal da ficha quanto na grade da Etapa 6 (que é 2D e hoje só entende esquerda/direita).

## Problema 2 — o "delay de alguns segundos" depois de soltar

Ao gravar a ordem, o sistema manda recarregar a ficha inteira e a lista de imóveis. As fotos voltam com endereços novos e o navegador baixa tudo de novo — daí a pausa e o piscar.

**Correção:**
- Depois de gravar, atualizar a ordem direto no que já está em memória, sem recarregar ficha nem lista.
- Gravar só quando você solta a foto (e no máximo ~250 ms depois), em vez de disparar a cada troca durante o arraste.
- Se você fizer várias trocas seguidas, uma única gravação e um único reenvio aos sites no fim.

## Extras de fluidez

- Auto-rolagem da faixa quando o arraste chega na borda passa a funcionar também quando a área rolável é o contêiner externo (hoje olha só o pai direto).
- Vibração e animação de deslize continuam; nada muda para quem prefere "reduzir movimento".

## Detalhes técnicos

- `src/components/imoveis/PhotoSortableGrid.tsx`: substituir `document.elementFromPoint` por um cálculo de índice a partir dos retângulos cacheados em `rectsRef` (centro mais próximo do ponteiro, com histerese para evitar oscilação); suportar grade 2D (setas cima/baixo no teclado); `autoScroll` procura o ancestral rolável mais próximo; disparar `onReorder` apenas em `pointerup`/tecla, mantendo o estado local durante o arraste.
- `src/hooks/usePropertyMedia.ts`: `reorderPhotos` com debounce 350 → 250 ms; após sucesso, aplicar `qc.setQueryData` nas chaves `imovel-detalhe` e `property-images` (reordenar em memória) em vez de `invalidateQueries`; manter rollback + toast em erro; manter agrupamento de ~3 s do `syncOrderToProviders`.
- `src/components/imoveis/PropertyGallery.tsx` e `PropertyPhotosStep.tsx`: apenas passar `onDragEnd`/contêiner rolável; sem mudança de layout.
- Sem alteração de schema, fila, worker, cliente HTTP, Drive ou wizard além da Etapa 6.

## Validação

Teste no preview com um imóvel real: arrastar da 5ª para a 1ª posição na ficha e na Etapa 6, conferir troca imediata, ausência de recarga das fotos e um único reenvio na fila de publicação.
