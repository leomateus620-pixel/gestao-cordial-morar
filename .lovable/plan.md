# Concluir a experiência pública Cordial

## Situação de partida (já verificada)
- E/0022 e D/0023 já aplicadas no banco (histórico com 24 entradas, 0000–0023). Não serão reaplicadas.
- A, B e C não aplicadas. A foi recusada pela plataforma ("Agent access to secrets is not allowed") porque a função de disparo lê o cofre.
- Bucket privado `public-site-derivatives` criado (25 MB, privado). A restrição a JPEG não pôde ser definida pela ferramenta.

## Etapa 1 — Migrações (Drizzle, aditivas, em ordem)
- 0024 = A1: tudo da A exceto `site_media_worker_dispatch()` e o agendamento (responsáveis, decodificação/normalização de texto, proteção de endereço, `cordial_site_eligible`, filtros/busca/contagem/facetas Cordial e Morar, `cordial_site_documents`, derivados, candidatos, tabela de saúde, validação de destaques). Inclui checagem de que o bucket existe e é privado.
- 0025 = B (vídeos), 0026 = C (tours), SQL original sem BEGIN/COMMIT externos.
- 0027 = A2: função de disparo e o agendamento `public-site-media-derivatives` criado **inativo**. Só roda se a plataforma permitir; se recusar, fica registrada a ação exata para o Leonardo.
- Cada arquivo leva um comentário com o arquivo original correspondente; AGENTS.md registra a correspondência A→0024+0027, B→0025, C→0026, D→0023.
- Verificação após cada uma: RLS e grants das tabelas novas, anon/authenticated sem execução nas funções internas, `shared_selection_save/close` intactas, endereço sempre nulo na projeção Cordial, Morar com política própria, vídeos/tours só quando aprovados.

## Etapa 2 — Testes locais (independente do banco remoto)
- `bun run test:site`, testes do assistente e seleções, typecheck e build com TZ=America/Sao_Paulo, em banco isolado. Correção de falhas encontradas.

## Etapa 3 — Mídia e worker
- Validação de JPEG mantida no servidor (o worker só grava JPEG gerado por ele) e limitação do bucket registrada.
- Conferir se o endpoint `site-media-worker` remove EXIF/GPS e respeita a ordem e a retirada; ajustar o código se necessário.
- Publicação do app (autorizada) para o endpoint existir no site publicado.
- Origem HTTPS no cofre: se `imobi_worker_origin` já estiver configurado, reaproveitar; caso contrário, solicitar ao Leonardo pelo cartão de segredos.
- Chamada de teste ao endpoint publicado com a autenticação interna (sem chave pública); só então ativar o agendamento e acompanhar a tabela de saúde e os primeiros derivados.

## Etapa 4 — Configurações com dados reais
- Responsáveis comerciais e WhatsApp da equipe: só com dados já cadastrados e aprovados no Gestão. Hoje o cadastro do corretor não tem telefone e o WhatsApp das imobiliárias está vazio, então isso deve virar pedido objetivo ao Leonardo.
- Política de privacidade, conteúdo editorial e tours: só se houver material aprovado no Gestão; caso contrário, entram no pedido.
- Formulário de contato: conferir que a mensagem distingue "recebido para triagem" de "atendimento criado".

## Etapa 5 — Vídeo, métricas e matriz
- Processador de vídeo real: não há serviço de transcodificação no servidor deste app; será pedido ao Leonardo qual provedor usar (com credencial). Os vídeos continuam fora do site até haver processamento e aprovação.
- Métricas: só com provedor e credencial reais; caso contrário, pedido.
- Pendências da matriz (seleções, favoritos, galeria, busca): conferidas contra o código e o banco; o que faltar e não depender de dado externo é implementado.

## Etapa 6 — Verificação no ambiente real e relatório
- Busca, contagem, facetas, permissões, contatos, seleção aberta em outra sessão, mídia autorizada, retirada com cache quente, estados de vídeo/tour, sem alterar imóveis nem usar dados de terceiros.
- Relatório final: migrações e histórico, o que foi publicado, configurações feitas, testes e resultados, o que funciona de fato e a lista de dependências com a ação exata.

## Restrição conhecida que só o Leonardo resolve
Se a A2 for recusada de novo: em Lovable Cloud, nas preferências de ferramentas do agente, liberar o acesso a segredos (ou aplicar a A2 manualmente). Sem isso, o agendamento de mídia não pode ser criado pelo agente.
