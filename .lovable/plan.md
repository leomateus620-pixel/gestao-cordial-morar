# Publicar os 2 imóveis nos sites (1400/3399 e 1372/3371)

## O que será feito, um imóvel por vez
1. **Conferência rápida (só leitura):** ver no Gestão o Número, o Complemento e as fotos de cada imóvel. Também ver nos dois sites, pela referência, se já existe anúncio. Isso evita criar um anúncio em dobro.
2. **Corrigir o endereço (só se precisar):** se o Número tiver mais de 15 caracteres, o bloco ou apartamento passa para o Complemento. O Número fica só com o número da rua. Nada mais muda no cadastro: proprietário, corretor, códigos, fotos e valores ficam iguais.
3. **Publicar na Cordial e no Morar** pela fila normal, com a nova conferência do endereço antes do envio.
   - Se o anúncio já existir no site, só os dados que faltam são enviados.
   - Se não existir, o anúncio é criado uma única vez.
4. **Fotos:** são enviadas logo após a criação, na ordem do Gestão, com a capa primeiro e respeitando o limite de envio do site.
5. **Conferência final:** uma leitura em cada site confirma o anúncio único, o endereço com o complemento certo, as fotos completas e a capa. Mostro a você o resultado com os códigos dos anúncios.

Começo pelo 1400/3399 e só passo para o 1372/3371 depois que o primeiro estiver confirmado.

## Garantias
- Nenhum anúncio é apagado ou recriado.
- Nenhuma foto é duplicada.
- Os outros imóveis da fila continuam andando.
- A NFS-e não é tocada.
- Este pedido autoriza alterar somente o endereço (Número e Complemento) desses 2 imóveis, se for preciso, e publicá-los.

## Detalhes técnicos
- A leitura usa SELECT em `properties` e `property_provider_publications` e GET por referência na ImobiBrasil.
- Se precisar, um UPDATE pontual em `properties.numero` e `complemento` só pelos 2 ids.
- A publicação passa por `enqueuePropertySyncCore` (action `publish`, providers cordial e morar). Depois vem o `media_sync`.
- Se o `create_state` estiver ambíguo, vale a regra das 3 leituras de ausência, sem reenvio às cegas.
