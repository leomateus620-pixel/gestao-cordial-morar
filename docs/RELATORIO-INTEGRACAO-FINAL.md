# Relatório final — integração Gestão Cordial / Morar

Data: 22/09/2026

## O que está comprovado

- **Cadastro e publicação nas duas imobiliárias** com identidade própria por
  destino (imóvel de teste: Cordial 1381/4355160, Morar 3380/4355161). Os dois
  vínculos estão `published` e com IDs preservados.
- **Alteração mínima**: omitir campo preserva, campo vazio limpa. Comprovado em
  rodada anterior alterando e limpando `localChave` nos dois sites, sem tocar em
  valor, tipo, vídeo, pontos fortes, proprietário ou corretor.
- **Fotos ponta a ponta**: inclusão, substituição na mesma posição e exclusão
  pelo endpoint oficial (`POST /imovel/{id}/imagem/excluir/{codigoImagem}`),
  com conferência da galeria antes e depois e acompanhamento independente por
  imobiliária.
- **Saneamento de duplicatas de fotos** feito uma a uma, com conferência
  (registro em `docs/saneamento-fotos-19-09-2026.md`).
- **Notificações push**: exatamente um envio por destinatário e evento.

## O que foi implementado nesta etapa

- **Reconciliação de três estados por campo** (`tri-state.ts`): confirmado /
  Gestão / site, com a mesma normalização. Semântica dos hashes documentada em
  `docs/IMOBI-ESTADOS-SINCRONIZACAO.md`.
- **Correção da referência de comparação**: `upsertPublication` não grava mais
  os três hashes iguais. `last_published_hash` e `confirmed_field_snapshot` só
  avançam quando o valor local ficou realmente igual ao do site.
- **Importação incremental** (`remote-changes.server.ts`): aplica o que mudou só
  no site, preserva edição local pendente e limpeza intencional e, em
  divergência, mantém o valor do site registrando o valor anterior do Gestão em
  `property_field_conflicts`.
- **Fim do ciclo de sincronização**: `echo_payload_hash` marca o conteúdo que o
  Gestão acabou de publicar; a leitura seguinte reconhece o próprio envio em vez
  de chamá-lo de edição externa.
- **Leitura completa**: `fetchAllPropertyPages` (ativos, inativos ou todos) com
  sinal de paginação incompleta. Ausência, falha ou filtro geram suspeita
  (`missing_remote_suspeito`, `leitura_falhou`) e **nunca** remoção local.
- **Painel interno por imobiliária** (Integrações, só administradores): saúde da
  conexão, cadastro confirmado na API, mídia pendente, bloqueios, divergências,
  envios na fila, última confirmação e ação de recuperação. "Confirmado na
  imobiliária" e "aparecendo no site" são estados distintos.
- **Diagnóstico classificado de duplicações**: duplicação local, dois anúncios
  na mesma conta, repetição só na exibição e publicação legítima nas duas.
  Nenhuma exclusão automática; a decisão é caso a caso.
- **Recuperação reaproveita a identidade original**: sem ID remoto a ação é
  reconciliação por referência, nunca inserção.
- **Testes e CI**: o comando normal passou a rodar as 40 suítes (268 testes,
  todos passando) e `.github/workflows/ci.yml` roda tipos + testes.

## Migrações aplicadas

- `property_provider_publications`: `confirmed_field_snapshot`,
  `remote_field_snapshot`, `remote_snapshot_at`, `confirmed_revision`,
  `echo_payload_hash`, `echo_expires_at`, `conflict_count`, `remote_read_state`.
- Nova tabela `property_field_conflicts` com acesso de leitura para usuários
  autenticados e resolução restrita a administração e secretaria.

## Estado do sync

- Envio cadastral ativo (sem pausa).
- Imóvel de teste publicado nos dois sites; a referência de comparação dos dois
  vínculos será preenchida na primeira reconciliação após este deploy — hoje
  está vazia, e é justamente por isso que a comparação antiga não era confiável.
- Fotos do imóvel de teste em `order_drift`: ordem/capa divergentes, que só se
  resolvem por reconstrução com fotos já enviadas.

## Limitações reais da API (sem autonomia completa)

- **Não há webhook de imóveis** — a documentação só confirma webhook de leads.
  A detecção de mudança externa depende de leitura periódica, então há uma
  janela entre a alteração feita no site e a importação.
- **Resposta de inserção de imagem não documentada** — a confirmação é sempre
  por leitura da galeria; um envio interrompido fica como inconclusivo, sem
  reinserção cega.
- **Não existe endpoint de destaque** — capa e ordem só mudam por reconstrução.
- **Sem exclusão de imóvel** — o sistema nunca apaga cadastro remoto.

## Pendências de validação com autorização

Não foram executados nesta rodada, para não alterar dados reais sem seu aval:
exclusão de foto no imóvel de teste, arquivamento, e simulação de 429/timeout
contra os sites em produção.

## Etapas D–H (22/09/2026) — consistência final

### Problemas confirmados no código anterior
- `changed_fields` sobrescrito em todos os jobs pendentes; `sameValue(10.5,105)` verdadeiro; `enrichmentPatch` repunha campos limpos antes da comparação; upsert de conflitos incompatível com índice parcial.
- Vaga do limitador pedida só uma vez (repetições sem vaga); limitador indisponível liberava envio; o `catch` genérico repetia antes da hora erros com Retry-After longo.
- Falha parcial de características não impedia "publicado"; posse perdida podia ser engolida no envio de características.
- Descrição nunca era conferida (site devolve HTML e acentos em dupla codificação).

### Correções (arquivos)
- `client.server.ts`: vaga ANTES DE CADA tentativa; erros com destino definido não são repetidos pelo `catch`; limitador indisponível = adiar (não chamar o site).
- `rate-limit.server.ts`: erro do controle devolve `unavailable`, sem liberar envio.
- `sync.server.ts`: backoff com variação; publicação fica "pendente" com horário da próxima tentativa (erro só quando esgota); características parciais → cadastro "parcial"; `LeaseLostError` propaga.
- `payload-diff.ts` / `characteristics-diff.ts`: `normalizeRichText` para conferir a descrição.
- `cross-account.ts`, `remote-changes.server.ts`: divergência Cordial x Morar mantém o valor do Gestão e registra conflito; importação com revisão esperada.
- `list-plan.ts`, `read.server.ts`, `import.server.ts`: leitura paginada de ativos e inativos; página com falha nunca prova ausência.
- `publish.functions.ts`, `PropertyPublishPanel.tsx`: cadastro, características e fotos separados por imobiliária; "salvo aqui" x "confirmado no site"; campos não confirmados/não verificáveis listados; "Tentar cadastro de novo" / "Tentar fotos de novo" por destino (reaproveitam o anúncio); "Despublicar" renomeado para "Ocultar do site" (só oculta; não há exclusão de cadastro remoto).

### Testes
292 testes passando (`bun run test`), typecheck limpo. Novos: `client-retry.test.ts` (vaga por tentativa, Retry-After longo, limitador indisponível, POST sem repetição cega, isolamento por conta), `rich-text.test.ts`, `cross-account.test.ts`, `list-plan.test.ts`, `confirm-snapshot.test.ts`.

### Validação real — imóvel de teste 1381 (Cordial 4355160) / 3380 (Morar 4355161)
| Prova | Cordial | Morar |
|---|---|---|
| Preço e descrição salvos em sequência (rev. 9 e 10) | 181000 + frase no site | 181000 + frase no site |
| Edição com revisão antiga | recusada (conflito) | recusada |
| Reversão (rev. 11) | site respondeu 523; ficou pendente com horário; posse expirada recuperada; 3ª tentativa confirmou | confirmada na 1ª |
| Descrição conferida por leitura | confirmada | confirmada |
| IDs do anúncio | preservados | preservados |

Finalidade e tipo continuam "não verificáveis" (a leitura devolve o nome, não o código): por isso a revisão não é marcada como 100% confirmada — comportamento intencional.

### Limitações reais da API
- Inserção de foto sem ID documentado na resposta; sem idempotência de criação; sem alteração de destaque/ordem (só apagar e reinserir).
- Leitura não devolve códigos de finalidade/tipo.
- Webhooks de imóveis não confirmados pelo fornecedor (não usados).
- Descrição volta com acentos em dupla codificação (comparação corrige; exibição no site não foi alterada).
