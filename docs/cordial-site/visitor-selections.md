# Seleções públicas de visitantes

O rascunho de `/site/selecao` contém apenas até 20 UUIDs **públicos** Cordial. Ele usa uma chave própria no navegador, sincroniza mudanças entre abas e é independente de favoritos, rascunhos autenticados do Gestão e histórico de vistos recentemente. A ordem pode ser alterada; remover um imóvel ou limpar a seleção não altera o catálogo. O histórico local é limitado a 12 IDs e revalida resumos antes de exibir até seis opções.

`createVisitorSelection` é a única entrada do visitante para persistir a seleção. O servidor valida o corpo fechado, recusa origem estrangeira, aplica o limitador existente (8 criações/minuto por bucket do ingresso) e chama `shared_selection_visitor_create` com `service_role`. A RPC resolve os UUIDs exclusivamente em `cordial_site_documents`: um UUID interno, uma publicação de outro canal ou um imóvel sem elegibilidade Cordial não é aceito. Não há escolha de corretor, cliente, dados pessoais ou escrita em registros comerciais.

Uma criação gera uma seleção imutável com validade de 30 dias. Seu token de 256 bits é produzido por HMAC-SHA256 a partir de um requestId aleatório; a chave fica exclusivamente no servidor. O banco armazena apenas o hash do token. Retries do mesmo requestId/conjunto retornam o mesmo link e prazo; um conjunto diferente exige novo requestId. Não existe token de edição nem função anônima de editar/fechar: o link é somente de leitura. Alterar o rascunho e gerar novo link mantém o conjunto anterior até sua expiração.

`/site/selecao/$token` funciona sem o armazenamento do dispositivo de origem. A leitura é `no-store`, `noindex`, limitada a 60/minuto por bucket e passa por `shared_selection_visitor_public` no servidor. Cada abertura consulta novamente a projeção elegível. Um imóvel retirado retorna somente `{available:false,key}`; não expõe UUID, referência, preço, mídia nem dados privados e não é substituído automaticamente. Os cards usam resumos e capas pelo gateway autorizado, não URLs assinadas dos arquivos originais. O contrato público remove endereço exato e não inclui mapa, descrição, características privadas nem dados do navegador criador.

As funções e permissões legadas `shared_selection_save`, `shared_selection_close` e `shared_selection_public` permanecem intactas. O fluxo autenticado `/s/$token` mantém seu contrato próprio; ele não comprova o novo gateway de mídia nem a política mais restrita de localização do canal Cordial em `/site`. Essa diferença não foi alterada incidentalmente nesta entrega.

## Aplicação e configuração

- A migration aditiva `drizzle/migrations/0022_cordial_visitor_selections.sql` está registrada no journal Drizzle em idx 22. O projeto configura esse fluxo em `drizzle.config.ts`, com `LOVABLE_DB_MIGRATION_URL`. Ela depende da projeção pública Cordial e das funções já existentes do canal; não deve ser aplicada por adivinhação em um banco que não tenha esse esquema.
- Aplicação remota e produção não foram executadas. Antes da ativação, aplicar a migration pelo fluxo autorizado do projeto e conferir as permissões no ambiente de destino.
- Requer as configurações existentes de servidor `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `CORDIAL_SITE_RATE_SECRET`; configurar `CORDIAL_SITE_TRUSTED_IP_HEADER` apenas para um cabeçalho sobrescrito pelo ingresso confiável. Sem isso, o limitador usa o bucket compartilhado e não confia em `X-Forwarded-For` arbitrário.
- Ausência de configuração, função de banco ou conexão não produz link simulado. A interface informa que não gerou o link e conserva o rascunho. Não há provedor externo de envio: copiar, WhatsApp e Facebook só abrem a ação escolhida pelo visitante.
- Os registros vencidos deixam de ser legíveis imediatamente pela RPC. A limpeza física deve seguir a rotina de retenção autorizada do banco; nenhuma automação externa foi ativada.

## Evidência local

`tests/cordial-site/visitor-selection.test.ts` executa PostgreSQL/PGlite isolado com as migrations de publicação, sincronização/experiência disponíveis, seleções autenticadas 0010/0011/0012 e a nova 0022. Os sete testes cobrem cinco escolhas persistidas e ordenadas, distinção de IDs públicos/internos, retirada após leitura anterior, ausência de endereço/dados privados, retry idempotente, limites/expiração e grants legados intactos. A leitura separada recebe somente o hash do bearer; não usa rascunho do navegador. Isso valida o banco local, não prova aplicação remota ou dois aparelhos físicos.

`tests/cordial-site/visitor-store.test.ts` verifica persistência apenas de IDs, atualização por evento de outra aba, limite de 20 escolhas, reordenação e continuidade quando o navegador bloqueia o armazenamento.

`tests/cordial-site/experience.test.ts` cobre retorno reconhecido à busca, fallback externo/direto, links com `/site` no host Gestão, fragmento de foto preservado entre prévia e ficha com limite ao tamanho da galeria, mensagem WhatsApp com referência/link, resolução individual/central e eventos assíncronos com consentimento, lista fechada de campos e exclusão de objetos/PII. O evento `selection_changed` indica mudança de interface; não é uma conversão nem comprova envio por WhatsApp.
