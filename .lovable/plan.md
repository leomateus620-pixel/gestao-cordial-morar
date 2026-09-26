# Exibir no site próprio os imóveis que já estão no Cordial

## Situação conferida agora
- Imóveis com anúncio ativo no site Cordial: 91 publicados + 385 publicados com ajuste pendente.
- Desses, 453 atendem às regras do site (não rascunho, "exibir imóvel" marcado, não arquivado, disponível, venda ou aluguel).
- Ficam de fora: 36 ainda não enviados ao Cordial, 13 com envio parcial, 3 com erro e os que não cumprem as regras acima. Imóveis só da Morar não entram.

## O que será feito
1. **Aprovação em lote única** dos 453 imóveis, marcando no canal do site: autorizado, disponível, conteúdo revisado, áreas em m² e fotos prontas aprovadas. Nada muda no cadastro, preço, código, proprietário ou na integração ImobiBrasil.
2. **Manter atualizado automaticamente**: quando um imóvel for publicado no Cordial, ele entra no site; quando for editado, a aprovação acompanha a nova versão (hoje, qualquer edição tiraria o imóvel do ar); quando for retirado, arquivado ou ficar indisponível, sai do site. Fotos novas prontas passam a aparecer sozinhas.
3. **Conferir busca, filtros e listagem** com os dados reais: finalidade, tipo, cidade, bairro, valor, dormitórios, vagas, destaques da página inicial, detalhe e fotos. Corrigir o que aparecer errado.
4. Validar no endereço publicado com capturas da página inicial, busca filtrada e um detalhe com fotos.

## Detalhes técnicos
- Nova migração versionada: função administrativa `cordial_site_sync_from_provider()` que insere/atualiza `cordial_site_publications` e `cordial_site_media` para imóveis com publicação `cordial` em `published`/`out_of_sync`, reaproveitando `cordial_site_content_hash` e `cordial_site_image_signature`; executada uma vez na migração.
- Gatilhos em `properties`, `property_images` e `property_provider_publications` re-sincronizam a linha afetada (novo hash, novas assinaturas de fotos, retirada quando deixa de ser compatível), com auditoria preservada.
- Imóveis que o administrador retirar manualmente no painel ficam marcados e não voltam automaticamente.
- Sem alteração em RLS existente, no bucket privado ou nas rotas do Gestão.
