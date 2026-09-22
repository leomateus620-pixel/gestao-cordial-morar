# Consistência da integração ImobiBrasil (Cordial/Morar) — correção em etapas

Confirmado no código atual antes do plano:
- Após a gravação atômica do imóvel, `changed_fields` é atualizado em seguida em TODOS os jobs pendentes do imóvel (imoveis.functions.ts:651) — uma edição apaga a intenção da anterior.
- `sameValue` remove todos os pontos antes de comparar: 10.5 vira 105; "10,50" não bate com 10.5.
- `enrichmentPatch` (import.server.ts:270/399) ainda repõe campos vazios antes da comparação de três estados.
- Registro de divergências usa `onConflict` incompatível com índice único parcial.
- Retry-After é lido, mas há caminhos de repetição que não consultam o limitador antes de cada tentativa.

Os demais achados (lease, fotos por posição, snapshot com valor tentado, finalização de mídia sem posse) serão conferidos um a um na etapa correspondente antes de mexer.

## Etapa 1 — Salvamento e fila transacionais
- Nova RPC (migração aditiva) que grava, numa só transação: imóvel, revisão, campos alterados, destinos e jobs com referência imutável à revisão (tabela de revisões com snapshot dos dados).
- Estratégia escolhida: consolidação — o job pendente por imóvel/destino guarda a UNIÃO dos campos ainda não confirmados; cada campo aponta para a revisão que o definiu. Job antigo nunca confirma revisão mais nova.
- Remover o UPDATE posterior de `changed_fields`; todo erro de persistência aborta e é mostrado.
- `expected_revision` mantido; conflito devolve mensagem clara.

## Etapa 2 — Posse, lease e identidade
- Trava por imóvel+destino para efeitos externos, além do token do job.
- Renovar lease e checar posse antes de cada chamada externa; perda de posse interrompe.
- Finalização (incluindo `property_media_finish_job`) só agenda acompanhamento se o token for válido; respostas tardias descartadas.
- Unicidade de ID remoto por provedor. Criação ambígua segue reconciliação por referência (nunca POST cego; leitura incompleta ≠ ausência; duplicata não escolhe registro).

## Etapa 3 — Desejado / tentado / observado / confirmado
- Quatro snapshots por publicação; confirmado só avança campo a campo após leitura igual.
- Revisão só marcada confirmada sem pendências; campos divergentes ficam pendentes; não verificáveis ficam rotulados.
- Cadastro, características e fotos com estados separados; reconciliação de existência não limpa divergência cadastral.

## Etapa 4 — Comparação por tipo
- Substituir `sameValue` por comparador com tipo do campo: dinheiro (centavos), decimal, inteiro, texto, identificador, booleano, lista.
- Zero, vazio, nulo e ausente distintos. Mascarado/desconhecido nunca vira zero ou vazio.
- Contrato de alteração: omitir o que não mudou, limpar no formato aceito, vínculos (proprietário/corretor/usuário adicional) só com intenção explícita e código válido na conta.

## Etapa 5 — Fotos recuperáveis
- Identidade por foto local + publicação + provedor + operação; ID remoto só com evidência (nunca pela posição).
- `delivery_unknown` após timeout; reconciliar antes de reenviar.
- Plano de substituição/reconstrução persistido com passo e resultado; retomada após queda.
- Validar todos os arquivos (existência, integridade, formato) antes de qualquer exclusão.
- Confirmação exige quantidade, correspondência, ordem e capa; galeria vazia/menor nunca é completa. Nenhuma foto remota sem vínculo é removida.

## Etapa 6 — Importação e conflitos entre contas
- Remover `enrichmentPatch` do caminho; decisão tri-estado antes de qualquer escrita.
- Política: a regra "site prevalece" existente (22/09) vale só para conflito de UMA conta. Se Cordial e Morar divergem entre si no mesmo campo, preserva-se o Gestão e registra-se conflito — a ordem de importação não decide.
- Importação com revisão esperada; atualização, confirmação e conflito numa RPC transacional.
- Conflitos: trocar upsert por inserção compatível com o índice parcial, preservando histórico de resoluções.
- Após saída confirmada, atualizar a referência da entrada; eco só suprime conteúdo idêntico.

## Etapa 7 — Paginação, características, retirada
- Leitura paginada completa e retomável, ativos e inativos; lista vazia válida ≠ resposta inválida.
- Características por conta com recuperação de falha parcial; nunca mexer no catálogo global.
- Ocultar / retirar publicação / excluir cadastro separados; alinhar documentação e interface (não há exclusão automática de cadastro remoto).

## Etapa 8 — Limites e retentativas
- Limitador consultado antes de cada tentativa HTTP, orçamento por conta compartilhado.
- Retry-After (segundos e data) respeitado; espera longa vira reagendamento durável do job.
- Backoff com variação e teto; limitador indisponível → espera conservadora, não liberação.
- Catch genérico não repete operação já adiada; POST não idempotente sem repetição automática.

## Etapa 9 — Interface e logs
- Por destino: cadastro, características e fotos com estado (pendente, enviando, confirmado, parcial, divergente, não verificável, erro), "salvo no Gestão em" e "confirmado na imobiliária em".
- Reprocessar só o componente/destino pendente; nunca cria outro imóvel.
- Logs com correlação, revisão, operação, destino, tentativa; sem tokens ou dados pessoais.

## Etapa 10 — Testes
Testes de comportamento (incluídos em `bun run test` e CI), com provedor simulado e testes integrados de RPC/constraints/lease no banco, cobrindo toda a lista pedida (duplo clique, preço+descrição rápidos, dois usuários, falha entre etapas, aceite com resposta perdida, worker antigo, campo recusado, não verificável, decimais/dinheiro/zero/vazio, upload ambíguo, arquivo ausente, interrupção por passo, galeria vazia/incompleta/desconhecida, limpeza local, conflito Cordial/Morar, paginação interrompida, características parciais, Retry-After longo, limitador fora, falha de uma conta).

## Validação real e entrega
- Somente no imóvel de teste 1381/3380; nada destrutivo em imóveis de clientes; sync permanece ativo.
- Relatório final: problemas confirmados, correções/arquivos, migrações e implantação, testes, evidência Cordial e Morar separadas, limites da API (inserção de foto sem ID, sem idempotência, sem ordenação/destaque direto, webhook de imóvel não confirmado), pendências e antes/depois.

## Detalhes técnicos
- Migrações apenas aditivas (novas tabelas `property_revisions`, `property_sync_job_fields` ou colunas equivalentes; nova RPC de salvamento; nova RPC de importação; ajuste de índice de conflitos via novo índice + função de inserção). Nenhuma migração antiga é reescrita.
- Arquivos principais: imoveis.functions.ts, sync.server.ts, payload-diff.ts (novo field-compare.ts), update-contract.ts, media-sync.server.ts, gallery-rebuild.ts, import.server.ts, remote-changes.server.ts, client.server.ts, rate-limit.server.ts, read.server.ts, PropertyPublishPanel.tsx, ProviderOpsPanel.tsx.
- Execução em etapas com typecheck e testes após cada uma.
