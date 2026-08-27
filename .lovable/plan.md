# Corrigir links públicos nos imóveis publicados

## Diagnóstico confirmado
- A ficha e o componente do ícone já leem corretamente `publications[].publicUrl` e exibem o botão ao lado de **Editar** somente quando há URL.
- No banco existem **790 publicações** com status `published`, porém apenas **6** têm `external_public_url`; por isso o botão não aparece na grande maioria dos imóveis.
- O imóvel **Cód. 3069** do print está publicado na Morar, possui o identificador externo `3878010`, mas sua URL pública está vazia.
- A reconciliação atual só grava o link quando a resposta de detalhe da API traz uma das poucas chaves reconhecidas. Como isso não acontece para a maior parte do catálogo importado, 784 registros continuam sem link.
- Os dois sites aceitam uma rota pública estável baseada no identificador externo (`/imovel/{id}`), verificada nos hosts oficiais da Cordial e da Morar.

## Implementação
1. **Resolver URL pública de forma resiliente**
   - Manter como primeira opção a URL canônica devolvida pela API e validada pelo host oficial.
   - Quando a API não devolver URL, gerar a rota pública estável usando o host oficial do provedor e o `external_property_id` já persistido.
   - Centralizar essa regra no utilitário existente de URL pública, sem duplicar lógica na interface.

2. **Aplicar em todos os fluxos**
   - Usar o mesmo resolvedor na importação, publicação e reconciliação para que novos imóveis já recebam o link automaticamente.
   - Na leitura da ficha/listagem, fornecer o fallback seguro para registros antigos ainda sem `external_public_url`, evitando depender da próxima execução do worker para o ícone aparecer.

3. **Corrigir os registros existentes**
   - Preencher `external_public_url` nas publicações ativas que possuem `external_property_id` e ainda estão sem link.
   - Restringir os hosts conforme o provedor: Cordial e Morar, sem aceitar domínios externos.
   - Não alterar publicações sem identificador externo nem sobrescrever URLs canônicas já existentes.

4. **Exibição e interação**
   - Manter um ícone por publicação ao lado de **Editar**.
   - Exibir Cordial e/ou Morar conforme os destinos publicados.
   - Copiar a URL no clique, manter toast/check de confirmação e permitir abrir o anúncio pelo tooltip.
   - Ajustar a área de ações para preservar os ícones também em telas menores.

## Validação
- Conferir novamente os totais no banco e garantir que toda publicação com identificador externo tenha link resolvido.
- Validar o imóvel **Cód. 3069** e amostras Cordial, Morar e publicadas nos dois sites.
- Testar no navegador: presença dos ícones, URL copiada, toast, abertura em nova aba e layout responsivo.
- Confirmar que imóveis não publicados continuam sem botão.

## Arquivos e dados envolvidos
- `src/lib/imobibrasil/public-url.ts`
- Fluxos existentes de importação, sincronização e reconciliação ImobiBrasil
- `src/lib/imoveis/imoveis.functions.ts`
- `src/components/imoveis/CopyPublicLinkButton.tsx`
- `src/routes/_app.imoveis.$imovelId.index.tsx`
- Atualização controlada de `property_provider_publications.external_public_url`
