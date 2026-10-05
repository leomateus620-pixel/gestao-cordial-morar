# Arquitetura e direção visual do site Morar

## Identidade e composição

A Morar conserva sua própria identidade dentro da plataforma comum: logo oficial colorido, grafite `#333333`, laranja predominante `#eb7a1c`, branco quente `#fcfaf7` e superfícies discretas em tons de areia. A marca permanece nas ações, nos ícones e em detalhes da composição. A cor de ação `#aa4707` oferece contraste de 5,72:1 sobre `#fffdf9`; texto secundário `#706b65` sobre o fundo principal mede 5,06:1. São medições dos pares de tokens, não certificação de toda a interface.

O arquivo local `public/morar-site/logo.jpg` preserva o JPEG oficial de 728×291 pixels, suas proporções e fundo. Origem: `https://cdn-img-src.imobibrasil.app.br/2eb05d8e5e980c5fe0d392246914463fce1487ce/logos/logo_site/202312041701518711.jpeg`. O asset foi recuperado da entrega normal já carregada pelo navegador e conferido visualmente. Não depende do CDN antigo em runtime e não constitui licença para reutilizar scripts ou fotografias do fornecedor. A identidade é utilizada neste projeto a pedido da imobiliária; não se redesenhou ou recoloriu a marca-d'água.

A tipografia usa somente Manrope, já hospedada localmente com licença OFL no projeto, mais fallback Arial/sans-serif. A home combina fotografia real elegível e texto legível sobre overlay, busca em primeiro plano, card editorial quando existe apenas um destaque, seção de casas para aluguel, bairros derivados do catálogo e chamadas humanas de contato. Fotografias e descrições não são criadas para a composição.

## Superfícies independentes e núcleo comum

O registro fechado de marcas aceita somente `cordial` e `morar`. Cada marca define namespace, API, nome, logo, classe de tema, chave de favoritos e evento de sincronização. O padrão dos helpers continua sendo Cordial: `/site` e `/api/cordial-site`. Morar usa `/site-morar` e `/api/morar-site`.

`SiteBrandContext` identifica a marca da rota, sem derivá-la de parâmetros arbitrários do visitante. Cards, galeria, paginação, formulários e páginas de conteúdo compartilham comportamento, enquanto a home, a paleta e a composição Morar são próprias. Os adaptadores de dados/SEO Morar passam a marca explicitamente ao núcleo; publicação e mídia também precisam ser autorizadas no servidor, mesmo que o visitante informe um UUID conhecido.

Os estilos estruturais continuam isolados do administrativo. O stylesheet Morar só modifica `.morar-site`; o wrapper conserva a classe estrutural compartilhada. Menu, drawer de filtros e lightbox recebem o tema também no `Dialog.Portal`, que não herda CSS de um ancestral visual. A navegação entre marcas não deve mudar a apresentação Cordial.

Favoritos Morar usam `morar.site.favorites.v1` e o evento `morar-favorites`; Cordial conserva suas chaves existentes. Rascunhos de contato incluem marca, finalidade do formulário e identidade pública do imóvel. Contato geral Morar não herda rascunho da Cordial. Os campos de contato da configuração inicial ficam em branco até confirmação do operador; divergências de endereço encontradas no antigo não são resolvidas por suposição. Não há conta pública obrigatória para favoritos, compartilhamento ou pesquisa. A primeira renderização do formulário é determinística no servidor e no navegador: campos visíveis, interações desabilitadas por poucos instantes e nenhuma leitura de rascunho privado durante o render. Após hidratação, um effect restaura o rascunho ou cria a identidade da tentativa e habilita os controles; autosave só começa depois dessa restauração. Erro/retry mantém a identidade da tentativa. Links de interesse em preview também começam com o mesmo caminho relativo no SSR e no cliente; a origem do navegador é acrescentada depois da hidratação, sem inventar canonical.

## Busca e movimento

Cinco grupos combinam ícone, rótulo e indicador de seleção: tipo, localização, orçamento, espaços e filtros adicionais. Desktop expande um painel abaixo da faixa, ocupando a largura disponível. No celular, a pesquisa completa usa um drawer Radix com os mesmos grupos; a busca da home conserva painel direto e mantém o botão principal antes dos grupos na composição móvel. Cidade controla opções de bairro e sua mudança limpa a escolha dependente.

Aplicar escreve filtros e página na URL; alterar filtros reinicia a paginação. Limpar remove o rascunho de filtros; chips de resultados também permitem remoção individual. Contagem consulta o servidor após 400 ms e usa `AbortController` mais uma sequência de pedidos para descartar resultados antigos. Falha da contagem tem mensagem própria. Erros de validação abrem o grupo correspondente, associam a mensagem ao campo e levam foco ao primeiro erro.

O movimento orienta a leitura: entrada curta do texto em 580 ms, painel em 250 ms, transições pequenas de ícones/cards e revelação controlada de seções. Título, fotografia e busca não aguardam uma timeline. `prefers-reduced-motion` desativa animações/transições e deixa as seções visíveis. Não há autoplay de galerias, scroll hijacking, parallax obrigatório, áudio ou atualizações React a cada frame.

Menu, filtros e galeria usam gestão de foco/Escape do Radix. Painéis inline também recolhem com Escape e devolvem foco ao botão do grupo. Controles principais e favoritos Morar têm pelo menos 44 pixels. WhatsApp/Instagram usam SVGs locais com rótulos acessíveis; clique em contato não é registrado como prova de atendimento. Até 760 px o botão flutuante Morar é ocultado para não cobrir a busca. WhatsApp permanece no menu móvel, na chamada de conversa, no contato e no detalhe quando configurado.

## Conteúdo, SEO e carregamento público

Menu e rodapé mantêm Compra, Locação, Anunciar, Sobre, Bairros, Financiamento, Correspondente, Notícias, Contato, Favoritos e Privacidade. Notícias, conteúdo institucional e textos de bairro vêm do CMS da marca. Estados vazios são explícitos; conteúdo inexistente não é substituído por artigos ou promessas fictícias. Bairros com catálogo têm links que realmente aplicam cidade/bairro.

Metadados SSR identificam Morar, usam a imagem autorizada estável e mantêm a descrição correspondente à oferta visível. Homologação é `noindex`; resultados de busca também evitam indexação de combinações ilimitadas. Origem canônica e eventual ativação na raiz de domínio próprio são configurações explícitas. Não se deduz domínio definitivo do preview e não se desloca o Gestão.

Na inspeção do grafo de imports dos componentes e rotas públicas, não há sidebar administrativa, `useSession`, middleware autenticado nem componentes de edição. O root comum mantém QueryClient, Toaster e tratamento de erros já existentes. Seu gate de metadados reconhece ambos os namespaces públicos e evita carregar stylesheet/fontes/metadados administrativos nessas páginas. Imports da implementação do servidor permanecem na ramificação server de `createIsomorphicFn`; o cliente usa somente a API da marca. O fato de o build conter chunks administrativos para outras rotas não prova carregamento desses chunks na página pública. A verificação de recursos efetivamente baixados e segredos ausentes do bundle deve constar da validação, separadamente desta inspeção estática.

## Evidência disponível e revisão restante

Foram executados quatro testes puros novos de frontend: resolução fechada de marca, separação de caminhos/mídia/estado local, identidade SEO e ativação explícita de raiz. Junto com sete testes existentes de contrato/routing, os 11 passaram. Tipagem completa e lint do escopo frontend passaram. Esses resultados não demonstram catálogo ativo em produção nem equivalência visual de todas as fotos.

A revisão no navegador deve registrar home, resultados, filtros abertos, detalhe, galeria, menu e contato nas larguras 360, 390, 768, 1024 e 1440 px; validar contraste sobre a fotografia escolhida, foco, teclado, zoom, texto longo e ausência de overflow. Teste em viewport emulado deve ser identificado como emulação. Firefox/WebKit, aparelhos físicos, leitor de tela, auditoria WCAG completa e métricas de campo exigem evidências específicas. A aplicação de migrações, ativação comercial e deploy ficam fora da entrega de código até autorização própria.
