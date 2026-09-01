# Campo "Localização Google Maps" com prévia no card interno

## O que existe hoje

Na ficha do imóvel há apenas um botão "Abrir endereço no Google Maps", montado a partir do endereço digitado (rua, bairro, cidade). Não existe nenhum campo para colar o link exato do local, e o banco não tem coluna para guardar esse link. Em muitos imóveis (terrenos, chácaras, casas sem numeração) o endereço textual leva o Maps para o lugar errado — daí o pedido.

## O que será entregue

1. **Novo campo "Localização Google Maps"** na Etapa 2 (Localização) do cadastro e da edição de imóveis.
   - O corretor cola o link copiado do app do Google Maps (funciona tanto o link curto `maps.app.goo.gl/...` quanto o link longo `google.com/maps/...`).
   - Validação: só aceita links do Google Maps; mostra aviso claro se colarem outra coisa.
   - Texto de apoio: "Uso interno — não é enviado aos sites Cordial e Morar."

2. **Card de prévia nas Informações internas** (bloco âmbar da ficha):
   - Mostra um mapa embutido apontando exatamente para o ponto do link salvo.
   - Botão "Abrir no Google Maps" (abre em nova aba) e "Copiar link".
   - Quando não houver link salvo, o card continua mostrando o botão atual baseado no endereço, para não perder o que já funciona.
   - Visível e utilizável por todos os perfis que abrem a ficha (admin, corretor, secretária).

3. **Nunca vai para os sites**: o campo entra junto dos demais dados internos e fica fora do envio para Cordial e Morar, com teste garantindo isso.

## Detalhes técnicos

- Migração: `ALTER TABLE public.properties ADD COLUMN localizacao_maps_url text` (sem alterar grants/RLS existentes).
- `src/types/property.ts`: adicionar `localizacaoMapsUrl` a `PropertyWriteInput`.
- `src/lib/imoveis/imoveis.functions.ts`: mapear leitura/escrita da nova coluna (create/update/detail).
- `src/components/imoveis/PropertyForm.tsx`: campo na Etapa 2, com `emptyPropertyValues` e validação de host (`google.com/maps`, `goo.gl/maps`, `maps.app.goo.gl`).
- Novo `src/lib/imoveis/maps-link.ts`: extrai coordenadas / `place_id` / query do link longo; funções puras cobertas por teste.
- Novo server fn `resolveMapsLink` em `src/lib/imoveis/maps-link.functions.ts`: para link curto, faz `fetch` com `redirect: "follow"` e lê a URL final para obter as coordenadas; resultado guardado junto do link (coluna adicional `localizacao_maps_coords text`) para não refazer a resolução a cada abertura.
- Novo `src/components/imoveis/PropertyMapsCard.tsx`: `iframe` `https://www.google.com/maps?q=<lat>,<lng>&z=16&output=embed` (sem chave de API, `loading="lazy"`), com fallback para botão de link quando as coordenadas não puderem ser extraídas.
- `src/routes/_app.imoveis.$imovelId.index.tsx`: renderizar o card dentro da seção interna âmbar.
- `src/lib/imobibrasil/serializers.ts` + teste: confirmar que o novo campo não entra em nenhum payload de publicação.
- Sem mudanças em fila, worker, cliente HTTP ou wizard além da Etapa 2.
