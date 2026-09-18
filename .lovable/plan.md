# Limpeza segura dos pontos fortes: lista, acompanhamento e auditoria em dry-run

Nada será enviado aos sites. Nenhum POST, nenhum bypass da pausa de segurança, nenhuma limpeza automática.

## O que fica como está

- Pausa de segurança das atualizações cadastrais permanece ligada.
- Correções já feitas no serializador continuam: informações internas nunca entram no que vai ao site, e o campo público é enviado vazio quando não há conteúdo legítimo.
- Testes A–F com varredura de todo o conteúdo enviado permanecem.
- Proteção da importação contra texto interno vindo do site permanece.

## 1. Lista definitiva dos 417 anúncios

Planilha entregue em Arquivos, ordenada com os 52 publicados no topo e os 365 fora de sincronia em seguida, com uma coluna por item pedido:

imóvel / property_id · site (Cordial ou Morar) · código local · external ID · URL pública · texto remoto atual · texto público local correto · classificação (somente interno, legítimo + interno misturado, incerto) · status (published / out_of_sync) · texto final que deve permanecer no site.

O "texto final" é o resultado do filtro aplicado ao texto público local: quando não sobra nada legítimo, a instrução é deixar o campo vazio. Os casos em que o filtro não decide com segurança entram como "incerto" e ficam marcados para conferência humana, sem instrução automática.

## 2. Acompanhamento da limpeza dentro do Gestão

Nova tela em Integrações: "Limpeza de pontos fortes". Somente leitura da API (GET), nunca escrita.

- Cada anúncio tem um estado: pendente → limpo manualmente → reconferido.
- Filtros por site, por status de publicação e por estado; busca por código.
- Botão "Reconferir" por linha e "Reconferir selecionados" em lote (respeitando o limite de 20 consultas por minuto por site).
- A reconferência lê o anúncio e verifica três coisas: o texto interno desapareceu; o conteúdo público legítimo foi preservado; nenhum outro campo do anúncio mudou em relação ao retrato guardado antes da limpeza. Só passa para "reconferido" se as três forem verdadeiras; caso contrário volta para pendente com o motivo.
- A confirmação da limpeza de pontos fortes **não** marca o imóvel como sincronizado; o painel de publicação segue com os estados de mídia e cadastro que já existem.

## 3. Auditoria em dry-run do /imovel/alterar

Relatório gerado sob demanda para um imóvel escolhido, sem enviar nada:

- Monta o corpo completo que seria enviado hoje e compara campo a campo com o que o site retorna.
- Classifica cada campo: igual, seria alterado, ficaria vazio, não reconstruível com segurança.
- Linhas explícitas para código do proprietário, código do corretor, fotos e ordem, preço, descrição, localização e características.
- Veredicto final: liberado apenas se o único campo com diferença for o de pontos fortes; qualquer outro risco resulta em "não executar".

O resultado é apenas um relatório na tela e um arquivo. A execução do POST continua dependendo de autorização explícita sua.

## Detalhes técnicos

- Nova tabela `property_hotspot_cleanup` (property_id, provider, external_id, codigo, url, remote_snapshot jsonb, remote_pontos_fortes, local_pontos_fortes, expected_final, classification, publication_status, state, last_checked_at, check_result jsonb). Migração aditiva, com GRANT e RLS restrita a usuários autenticados com papel administrativo.
- Seed da tabela a partir de `/tmp/sweep.jsonl` cruzado com `properties` e `property_provider_publications`; o snapshot completo do GET é guardado para servir de base da comparação campo a campo.
- Server functions novas em `src/lib/imobibrasil/hotspot-cleanup.functions.ts`: listar, marcar como limpo manualmente, reconferir (usa `fetchPropertyDetail` de `read.server.ts`, apenas GET, através do limitador em `rate-limit.server.ts`) e gerar o dry-run.
- Dry-run reutiliza `serializeProperty` em memória (`mode: "update"`) e faz o diff contra `remote_snapshot`; nenhum caminho de escrita é importado.
- UI em `src/components/integracoes/HotspotCleanupCard.tsx`, ligada em `src/routes/_app.integracoes.tsx`.
- `serializers.ts`, `import-normalizers.ts`, `sync.server.ts` e a trava `imobi_update_sync_paused` não são alterados.
