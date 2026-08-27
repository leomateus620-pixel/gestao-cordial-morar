# Copiar link público (Cordial/Morar) no cabeçalho da ficha do imóvel

## Objetivo
Na ficha detalhada do imóvel (`/imoveis/$imovelId`), ao lado do botão "Editar", exibir ícones de copiar link público — um por site onde o imóvel está publicado. Se o imóvel está publicado na Cordial e na Morar, aparecem dois ícones; se está em apenas um, aparece só um. Cada ícone copia o link canônico verificado daquele site e, ao clicar, confirma com toast.

## Estado atual (confirmado)
- A ficha já carrega `imovel.publications` com `provider` ("cordial" | "morar"), `status` e `publicUrl` (link canônico verificado pela API do site — nunca montado por adivinhação de slug).
- Já existe o componente `CopyPublicLinkButton.tsx`, usado nos cards do catálogo, que copia o link com feedback e fallback desabilitado quando não há URL verificada.
- O cabeçalho da ficha (`src/routes/_app.imoveis.$imovelId.index.tsx`, bloco do botão "Editar") é o ponto de inserção.

## Implementação
1. **Cabeçalho da ficha** (`src/routes/_app.imoveis.$imovelId.index.tsx`):
   - Filtrar `imovel.publications` para status `published` com `publicUrl` presente.
   - Renderizar, antes do botão "Editar", um ícone circular (mesmo padrão visual do botão voltar: `glass-panel size-9 rounded-full`) por publicação.
   - Cada ícone usa o rótulo da imobiliária (Cordial/Morar) via tooltip e `aria-label` ("Copiar link Morar", "Copiar link Cordial"), com distinção visual sutil por marca (cores de marca já existentes em styles.css).
   - Clique copia a URL com `navigator.clipboard`, mostra check temporário + toast de confirmação ("Link Morar copiado").
   - Segundo clique/estado: manter também a opção de abrir o link em nova aba (modifier ou pequeno ícone externo dentro do tooltip), alinhado ao comportamento do card do catálogo.
2. **Reuso**: extrair a lógica de cópia já existente em `CopyPublicLinkButton` para o novo botão de ícone (ou criar variante `iconOnly` no mesmo componente), evitando duplicação.
3. **Sem URL verificada**: não exibir o ícone (a seção "Visão geral" já mostra o status de publicação; nunca gerar link por adivinhação).

## Detalhes técnicos
- Arquivos: `src/routes/_app.imoveis.$imovelId.index.tsx`, possivelmente `src/components/imoveis/CopyPublicLinkButton.tsx` (nova variante de ícone).
- Sem mudanças de backend, banco ou RLS — somente UI com dados já disponíveis.
- Verificação: abrir a ficha de um imóvel publicado nos dois sites (ex.: Cód. 584 do print), confirmar dois ícones, copiar cada link e conferir o conteúdo da área de transferência e os toasts; testar imóvel publicado em apenas um site e imóvel sem publicação (nenhum ícone).
