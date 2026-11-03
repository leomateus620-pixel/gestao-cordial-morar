# Upgrade visual da home do site Cordial

Entrega em 3 fases, cada uma conferida na prévia antes da seguinte. Nada é publicado sem a sua autorização. O site Morar, o Gestão e o Realce não mudam.

## Fase 1 — Visual e dados da home (sem IA)
1. **Situação antes da mudança:** capturas em 1280×720, 1366×768, 1440×900, tablet, 390×844 e 360×800. Medir também a rolagem lateral (1855 px numa tela de 1363 px) e o tamanho dos cards.
2. **Cabeçalho branco** (72–80 px no computador, 60–68 px no celular): ícones com texto em Comprar, Alugar, Bairros, Anunciar, A Cordial e Contato. Favoritos e seleção ficam como ícones com nome acessível. Logo oficial adequada ao fundo branco: se não houver uma, paro e pergunto em vez de aplicar filtro na marca.
3. **Abertura imersiva** (480–600 px): foto ocupando a seção toda, com título e busca à esquerda e um card do mesmo imóvel à direita. Aproximação suave, que para fora da tela e respeita quem pediu menos movimento. Nesta fase a foto é a original aprovada do imóvel escolhido.
4. **Cinco destaques + bairros:** um card grande e quatro menores lado a lado, com o painel de bairros ao lado (busca, 6 bairros com contagem real por cidade + bairro, "Ver todos"). No computador cabe inteiro nas três telas de referência. No tablet vira grade, e no celular uma lista vertical.
5. **Mais imóveis para você:** 15 cards compactos, diferentes dos 5 destaques. A exclusão é feita no servidor, sem repetir para completar.
6. **Regras da vitrine:** entram só imóveis com capa. No painel, "Modo: mais recentes (padrão) / escolha manual até 5". Uma configuração antiga com até 9 imóveis continua funcionando, e o painel mostra os que sobram além de 5.
7. **Fotos:** tamanhos certos para cada tipo de card. Só a foto da abertura tem prioridade, as demais carregam conforme a rolagem. Os cards mostram só a capa, e a galeria abre ao interagir. Espaço reservado para evitar saltos. Corrigir a rolagem lateral na origem.

## Fase 2 — Imagem semanal com edição por IA
1. Registro próprio da vitrine semanal, separado do Realce. Ele guarda: imóvel, foto de origem, checksum, modelo, versão do prompt, estado, vigência e pontos focais.
2. Worker com trava e chave única por marca + semana + imóvel + foto. Estados: agendado, gerando, aguardando revisão, pronto, ativo, falhou, incerto. Um caso "incerto" nunca é reenviado sozinho.
3. Agendamento: prepara a imagem com antecedência e ativa na segunda às 06h (São Paulo), horário configurável. A rotina usa a credencial interna do cofre, como as rotinas atuais.
4. Edição fiel (luz, contraste, branco, nitidez, recorte), sem inventar nem remover nada. Uso o modelo de edição atual da OpenAI, conferido na lista disponível antes de escolher.
5. A ativação exige aprovação. Sem aprovação na troca, a home usa a foto original e o painel diz isso. Se o imóvel sair do site ou a foto for revogada, a vitrine troca de imóvel. Sem nenhum candidato, a abertura fica neutra.
6. Nenhuma chamada de IA acontece durante a visita ao site.

## Fase 3 — Área "Vitrine do site" no painel
Imóvel da semana, original × edição, prévia computador/celular, ponto focal, vigência, aprovar/ativar/pausar, última execução. Regenerar mostra o custo antes e bloqueia pedidos duplicados.

## Validação
Build, checagem de tipos e testes do site. Testes novos: escolha dos 5, exclusão dos 15, troca semanal sem duplicar, retirada de imóvel e vínculo foto ↔ anúncio. Capturas antes/depois nas 6 resoluções, só por emulação: não tenho aparelho real. Medição de LCP, CLS e INP em laboratório, antes e depois, nas mesmas condições.

## Pontos que dependem de você
- Logo oficial para fundo claro (se não houver no projeto).
- Aprovação da edição de cada semana (ou dizer que pode ativar sem revisão).
- Cada edição gasta créditos de IA. Informo o custo estimado antes de ligar a geração.

## Detalhes técnicos
- Arquivos: `site.index.tsx` (loader com `featuredMode` e exclusão por IDs), `HomePage.tsx` (novas seções), `PropertyCard.tsx` (variantes `hero`, `mosaic-lg`, `mosaic-sm`, `compact`), `SiteShell.tsx`, `site.css` (estilos com escopo Cordial), `contract.ts`/`data.ts` (`excludeIds`, contagem de bairros por cidade), `_app.site-administracao.tsx`.
- Fase 2: migração aditiva (`cordial_site_weekly_showcase` + tentativas, RLS + grants + política restritiva `meta_reviewer_block`). Rota `/api/public/hooks/cordial-showcase` com `internal_worker_headers()`, bucket privado e entrega pelo gateway de mídia atual, com verificação de elegibilidade. A migração entra no journal Drizzle.
