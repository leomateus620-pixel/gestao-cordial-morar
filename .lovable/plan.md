# Organização rápida das fotos (arrastar e soltar)

Hoje só existe reordenação por setinhas dentro do formulário (Etapa 6). Na ficha do imóvel a galeria é apenas para visualizar. A ideia é permitir arrastar as fotos, salvar sozinho e mandar a nova ordem para os sites.

## O que muda

### 1. Ficha do imóvel — organizar sem entrar em edição
- Abaixo da galeria, a tira de miniaturas vira uma faixa organizável: arraste uma foto para a posição desejada (mouse, toque no celular e teclado com setas).
- A primeira posição é a capa. Também dá para tocar na estrela para definir a capa direto.
- Um botão "Organizar fotos" liga/desliga o modo, para o clique normal continuar abrindo a foto ampliada.
- Disponível para quem já pode editar o imóvel; para os demais a galeria segue só de leitura.

### 2. Cadastro/edição do imóvel (Etapa 6)
- A grade de fotos passa a aceitar arrastar e soltar, mantendo as setinhas atuais como alternativa.
- Mesma sensação nas duas telas: indicação visual da posição de destino enquanto arrasta.

### 3. Salvamento automático
- A nova ordem é aplicada na hora na tela e gravada automaticamente (sem botão "salvar").
- Falha de gravação volta a ordem anterior e mostra aviso.
- Várias trocas seguidas são agrupadas e gravadas uma única vez (aprox. 800 ms depois da última).

### 4. Envio automático para os sites
- Se o imóvel já está publicado na Cordial e/ou Morar, depois de gravar a ordem o sistema reenfileira automaticamente a sincronização das fotos para os sites em que ele está publicado (mesma fila usada hoje pelo painel "Publicação nos sites"), com pequeno atraso para agrupar mudanças.
- Imóveis em rascunho ou arquivados não disparam envio.
- O painel de publicação continua mostrando o andamento ao vivo, sem mudanças no seu comportamento.

## Detalhes técnicos

- Novo componente `src/components/imoveis/PhotoSortableGrid.tsx`: reordenação com Pointer Events (sem nova dependência), suporte a toque, `aria` e atalhos de teclado; recebe `images`, `onReorder`, `onSetCover`, `onRemove` opcional.
- `src/components/imoveis/PropertyPhotosStep.tsx`: usa o novo componente no lugar da grade atual, preservando estados de marca-d'água, capa e remoção.
- `src/components/imoveis/PropertyGallery.tsx`: aceita props opcionais `editable`, `onReorder`, `onSetCover`; sem elas o comportamento é o de hoje.
- `src/routes/_app.imoveis.$imovelId.index.tsx`: liga a galeria ao `usePropertyMedia` (mutations `reorder`/`setCover`) quando o usuário tem permissão de edição.
- `src/hooks/usePropertyMedia.ts`: adiciona reordenação otimista com debounce e rollback em erro; no `onSuccess`, dispara `enqueuePropertySync` para os provedores já publicados.
- Backend reaproveitado sem mudança de schema: `reorderPropertyImages` e `setPropertyImageCover` em `src/lib/imoveis/media.functions.ts`, e `enqueuePropertySync` em `src/lib/imoveis/publish.functions.ts`.
- Fora de escopo: fila/worker, cliente HTTP das APIs, schema do banco, Drive e wizard além da Etapa 6.
