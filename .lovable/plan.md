# Conclusão das Fases 1, 2 e 3 — sites Cordial e Morar

Continua a partir do que já está na prévia (endereço oficial único, ícones e imagens por marca, sitemap/robots, redirecionamento das URLs antigas, painel "Site e Google", Pixel/GTM com consentimento). Nada é refeito nem duplicado. Sem publicação.

## Ponto importante sobre o banco
O sistema tem um único banco, usado pela prévia e pelos sites no ar. Não existe "banco de teste" separado. Por isso:
- Todas as mudanças de banco serão apenas aditivas (novas tabelas/colunas/funções, nada apagado ou alterado em massa) e ficam preparadas no projeto.
- Elas só serão aplicadas com seu "sim" explícito no final. Sem isso, as telas novas aparecem na prévia, mas não salvam até a aplicação.
- Alternativa: aplicar já as aditivas (não mudam nada do que está no ar, porque o site publicado ainda não as usa). Confirmo com você antes de aplicar.

## O que será entregue

A. SEO e endereço por imóvel
- Endereço amigável por marca: `/imovel/casa-3-quartos-centro-santa-maria-1398` (referência sempre no final, para não haver duplicidade).
- Título e descrição automáticos a partir do tipo, finalidade, bairro, cidade, quartos e preço; o admin pode substituir por imóvel.
- Endereço antigo (`/imovel/1398`) e o do ImobiBrasil passam a levar ao novo com 301; o mapa do site e o endereço oficial usam o novo.

B. Banners
- Por marca: imagem (enviada pelo painel, em versões leves para celular/tablet/desktop), legenda, link, ordem, data de início e de fim.
- Aparecem na página inicial só dentro do período; sem banner ativo, o layout atual não muda.

C. Busca
- Ordenação padrão, atalhos de busca rápida e tipos de imóvel exibidos por finalidade (comprar/alugar), por marca.
- Valores vazios mantêm o comportamento atual.

D. Destaques
- Quantidade de destaques por finalidade (regra única nas duas marcas, hoje cada uma tem a sua).
- Escolha e ordem manual de imóveis fixados; o restante é completado pela regra automática atual.

E. Redirecionamentos manuais
- Tela com lista, busca, criação e remoção; importação de planilha CSV com prévia (válido, conflito, imóvel não encontrado, da outra marca) antes de confirmar.
- Só administrador; registro de quem alterou.

F. Dados estruturados
- Trilha de navegação (Início › Comprar/Alugar › Cidade › Imóvel) na página do imóvel, igual ao endereço oficial.
- Revisão dos dados da imobiliária e do anúncio já existentes.

G. Revisão final contra o pedido original
- Lista item a item das três fases com situação real (salva, aparece no site, tem teste).
- Itens que dependem de você: textos de privacidade, redes, códigos Google/Bing/Pixel/GTM, banners e escolhas de destaque.

## Painel "Site e Google"
Reorganizado em abas, nas duas marcas: Identidade e redes · SEO · Página inicial (banners e destaques) · Busca · Redirecionamentos · Medição e privacidade.

## Validação
- Testes novos para: endereço amigável, metadados automáticos, período dos banners, limites de destaques, importação CSV, trilha de navegação.
- Testes dos sites, verificação de tipos e lint completos.
- Prévia nas duas marcas em celular, tablet e desktop.
- Envio, atualização e retirada de imóveis e fotos não são alterados; os testes existentes desse fluxo serão executados.
- Teste que falhava (despacho de fotos esperava 2, recebe 3): comparar com a versão anterior às mudanças para provar que já falhava, e documentar a causa. Não será "ajustado" sem sua decisão, porque toca no envio de fotos.

## Detalhes técnicos
- Migração aditiva: `slug`, `seo_title`, `seo_description` nas tabelas de publicação de cada marca (com preenchimento inicial só da nova coluna); tabelas `<marca>_site_banners` e `<marca>_site_featured_pins` com GRANT, RLS admin e política restritiva `meta_reviewer_block`; bucket `<marca>-site-banners`; resolver de redirecionamento estendido para slug; aplicação da 0089 já preparada.
- Configurações de busca/destaques em `content` das settings da marca (schema em `contract.ts`), sem tabela nova.
- Funções de slug, SEO automático, banners e destaques em módulos puros dentro de `src/lib/cordial-site/` com testes em `tests/cordial-site/`.
- Rotas do imóvel aceitam o novo formato e o antigo; o antigo responde 301.
