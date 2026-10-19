# Concluir a entrega Cordial: A2, contatos, privacidade, vídeo, métricas e publicação

## Diagnóstico do bloqueio da A2 (verificado)
- A tela de permissões do Lovable Cloud não tem item sobre segredos; "Modificar banco" já está liberado. A recusa vem de uma regra fixa da plataforma: nenhuma migração escrita pelo agente pode ler `vault.decrypted_secrets`. Não é a mesma coisa que o servidor usar a credencial em funcionamento. Nenhuma preferência resolve isso, então não vou repetir a mesma tentativa.
- O servidor já usa o cofre por funções existentes: `internal_worker_headers()` (credencial interna) e `assistant_routine_dispatch()` (lê `assistant_worker_origin`). A função `property_worker_dispatch`, que lia `imobi_worker_origin`, não aparece no banco atual, e o acesso de leitura não permite confirmar se esse nome existe no cofre.
- Alternativa suportada: o endereço do site não é segredo (é o endereço público já publicado). A A2 passa a ler a origem de uma configuração não secreta e continua autenticando só por `internal_worker_headers()`. Nenhuma chave pública, nenhuma leitura do cofre no SQL do agente.

## Etapa 1 — A2 (0027)
- `site_media_worker_dispatch()` igual ao original, exceto a origem: vem de `app_settings` (`site_media_worker_origin`, validada como `https://host` sem caminho). Sem origem válida, registra `origin_missing_or_invalid` na tabela de saúde e não chama nada.
- Agendamento `public-site-media-derivatives` (a cada minuto, como no original) criado desligado.
- Origem gravada: `https://gestao-cordial-morar.lovable.app`, o endereço publicado que atende `/api/public/*`.
- Registro em AGENTS.md: A = 0024 + 0027, com a diferença de origem documentada.

## Etapa 2 — Smoke test e publicação
- Testes completos (`bun run test`, `test:site`, `test:assistant`, `test:receipts`), typecheck e build.
- Teste na tela do Assistente (uma pergunta inventada) e do Estúdio (abrir, escolher imóvel, gerar rascunho), sem salvar nada comercial. Corrijo as falhas concretas encontradas.
- Publicação do app. Depois: chamada ao endpoint publicado sem credencial (espera 401) e uma execução manual pelo banco (espera resposta 200 e derivados criados). Só então ligo o agendamento e acompanho a saúde e o andamento dos derivados (fotos em ordem, sem EXIF/GPS, retiradas excluídas).

## Etapa 3 — Contatos públicos
- Procurar o WhatsApp institucional da Cordial na configuração do site, na configuração dos portais/ImobiBrasil, nos modelos de e-mail/recibo e nos dados da empresa; registrar a origem. Telefones de proprietários ou clientes não servem.
- Encontrado e sem conflito: gravar em `settings.whatsapp` (Equipe Cordial como responsável padrão).
- Responsáveis individuais: só corretores com WhatsApp comercial cadastrado. Hoje nenhum tem, então fica valendo a Equipe Cordial.
- Não encontrado ou conflitante: uma única pergunta objetiva ao Leonardo.

## Etapa 4 — Política de privacidade
- Conferir as orientações da ANPD (transparência e cookies) e o comportamento real do site: formulário e triagem, WhatsApp, favoritos e recentes no aparelho, seleções compartilhadas, hospedagem, métricas só com consentimento, retenção praticada.
- Redigir o texto, gravar em `settings.privacy` e conferir `/site/privacidade`, links e consentimento.
- CNPJ, razão social, encarregado e e-mail de solicitações: usar só se estiverem no Gestão (recibos/NFS-e já guardam os dados da empresa). Sem encarregado nomeado, o texto aponta o canal de contato da empresa e a decisão fica listada para o Leonardo.

## Etapa 5 — Vídeo com FFmpeg no Google Cloud Run Jobs
- Não há conexão Google Cloud no projeto. O Leonardo precisa ligar a conexão Google Cloud (cartão no chat), com projeto, região e conta de serviço com papéis mínimos.
- Código pronto mesmo antes disso:
  - contêiner com FFmpeg/ffprobe;
  - o processo chama `cordial_site_claim_video()` com credencial de serviço própria, baixa a origem, valida tamanho e duração (150 MiB / 180 s) e gera MP4 H.264 + AAC, com faststart, orientação corrigida, sem metadados, e um poster JPEG;
  - grava no armazenamento privado e chama `cordial_site_finish_video()`.
- Aditivo no banco: caminho e versão do poster no registro do vídeo, e a vitrine passa a devolver o poster autorizado.
- Erro, troca da origem e retirada já são tratados pelas regras atuais; acrescento testes.
- O vídeo só aparece depois da revisão do administrador.

## Etapa 6 — Google Analytics 4
- O Leonardo informa o ID de medição (G-…) da propriedade Cordial, pelo conector Google Analytics ou digitando. Gravo em `settings.analyticsMeasurementId`.
- Conferir o código atual: page_view manual com endereço limpo (sem token de seleção), sem duplicar na navegação por histórico, consentimento e revogação, eventos separados para clique no WhatsApp, formulário salvo e atendimento criado.
- A medição automática de navegação (Enhanced measurement, "mudanças de histórico") é desligada pelo Leonardo no painel do GA. Só depois ligo `analyticsManualEventsOnly` e confiro os eventos no relatório em tempo real.

## Etapa 7 — Validação no site publicado e relatório
- Busca, contagem, facetas, contato (lead de triagem ou atendimento criado), seleção aberta em outra sessão, galeria, mídia autorizada, retirada com cache quente e estados de vídeo e tour.
- Nenhum imóvel alterado e nenhum dado de terceiros.
- Relatório: o que foi aplicado, publicado, configurado e verificado, e só as dependências externas reais.

## Dependências que provavelmente vão ao Leonardo
1. Conexão Google Cloud (projeto, região, conta de serviço) para o processamento de vídeo.
2. ID de medição GA4 da Cordial e desligar a medição de histórico no painel do GA.
3. WhatsApp institucional e dados da empresa para a política, só se não forem encontrados no Gestão.
