# Fechamento da integração Cordial/Morar — reconciliação de três estados, painel interno e validação real

Objetivo: o Gestão passa a ser o ambiente principal. A Imobi continua sendo origem de dados,
as duas imobiliárias continuam recebendo publicação, e toda divergência é vista e resolvida
dentro do Gestão — sem ciclos de reenvio, sem exclusão automática, sem sobrescrita silenciosa
entre as duas contas.

Decisões já tomadas por você: validação real no imóvel de teste atual (1381 Cordial / 3380 Morar);
em divergência incompatível, o valor do site prevalece e a diferença fica registrada e visível;
duplicações ganham diagnóstico classificado com remoção somente após sua confirmação caso a caso.

## O que muda na prática

1. **Comparação confiável campo a campo.** Para cada imóvel e cada imobiliária o sistema guarda
   três fotografias: o último valor confirmado, o valor atual no Gestão e o valor atual no site.
   As três passam pela mesma normalização, então "R$ 450.000", "450000" e "450000,00" param de
   parecer diferentes.
2. **A referência só avança quando há confirmação.** Hoje a importação grava as três fotografias
   como iguais mesmo quando manteve dados locais diferentes — isso mascara diferença real e será
   corrigido. Quando a importação preserva dado local, a fotografia local continua diferente da
   do site e a diferença aparece.
3. **Importação automática do que não conflita.** Mudança feita só no site entra sozinha. Edição
   local pendente e limpeza intencional são preservadas. Quando os dois lados mudaram o mesmo
   campo, o site prevalece, o valor anterior do Gestão fica registrado e o caso aparece para
   conferência.
4. **Sem ciclo de sincronização.** O que o próprio Gestão acabou de enviar é reconhecido como
   eco do próprio envio e nunca tratado como edição externa; e uma importação não dispara
   republicação do mesmo conteúdo.
5. **Leitura completa e segura.** Todas as páginas são lidas, ativos e inativos são tratados
   separadamente, e ausência em uma página, falha de leitura ou filtro nunca apagam nada local.
   Aviso de mudança por webhook de imóvel não será usado: a documentação do fornecedor só
   comprova isso para leads.
6. **Cordial e Morar separadas.** Quando os dois anúncios são o mesmo imóvel interno, cada
   publicação mantém seus próprios dados e a última importação não sobrescreve a outra conta.
7. **Painel interno por imobiliária** (visível apenas para administradores, fora das telas de
   cliente): saúde da conexão, cadastro confirmado, mídia pendente, bloqueios, divergências,
   tentativas, última confirmação e ação de recuperação. O painel separa "confirmado na API" de
   "aparecendo no site". Repetir uma entrega reaproveita a identidade original, nunca cria anúncio.
8. **Diagnóstico de duplicações** classificado em: duplicação local, dois códigos diferentes na
   mesma conta, repetição visual do mesmo anúncio, e publicação legítima nas duas imobiliárias.
   Cada caso mostra vínculos, referências, fotos e dependências. Nada é removido por semelhança
   de endereço, referência parecida ou quantidade de cards.
9. **"Aparece no site, mas não no Imobi"** ganha uma investigação por conta, código, referência,
   permissão, filtro e estado de publicação, somente leitura, sem criar um segundo registro.
10. **Registro de operações** consolidado por operação, imóvel, destino e revisão, com motivo da
    falha, próxima tentativa e confirmação efetiva, sem token nem dado pessoal desnecessário.

## Detalhes técnicos

### Estado de três valores e fim da confusão de hashes
- Novo `src/lib/imobibrasil/tri-state.ts`: normalização única (`normalizeFieldValue`), comparação
  (`sameValue` reaproveitado de `payload-diff.ts`) e `classifyField` devolvendo
  `igual | mudou_local | mudou_remoto | conflito | limpeza_local | nao_verificavel`.
- Migração aditiva em `property_provider_publications`:
  `confirmed_field_snapshot jsonb`, `remote_field_snapshot jsonb`, `remote_snapshot_at timestamptz`,
  `confirmed_revision int`, `echo_payload_hash text`, `echo_expires_at timestamptz`,
  `conflict_count int default 0`.
- Semântica fixada e documentada em `docs/IMOBI-ESTADOS-SINCRONIZACAO.md`:
  `last_payload_hash` = hash do payload enviado (espaço de envio);
  `local_desired_hash` = hash do estado local normalizado;
  `remote_observed_hash` = hash do estado remoto normalizado;
  `last_published_hash` = hash normalizado confirmado por leitura.
  `reconcile.server.ts` passa a comparar `remote_observed_hash` com `last_published_hash` no mesmo
  espaço normalizado (hoje compara contra hash de payload, o que gera divergência falsa).
- Nova tabela `property_field_conflicts` (imóvel, destino, campo, valor confirmado, valor Gestão,
  valor site, resolução, decidido por, decidido em) com RLS + GRANT; leitura para `authenticated`
  via função de papel, escrita por `service_role`.

### Importação incremental sem sobrescrita
- `import.server.ts`: `upsertPublication` deixa de gravar os três hashes iguais; grava
  `remote_observed_hash` + `remote_field_snapshot` sempre, e `last_published_hash`/
  `confirmed_field_snapshot` apenas quando o local realmente ficou igual ao remoto.
- Novo `applyRemoteChanges`: aplica campos `mudou_remoto`, ignora `mudou_local` e `limpeza_local`,
  e em `conflito` aplica o valor do site (decisão escolhida), gravando o caso em
  `property_field_conflicts` com o valor anterior do Gestão.
- Campos protegidos permanecem intocados: proprietário, corretor, códigos, fotos, agenda, pontos fortes.
- Eco do próprio envio: após publicar, `sync.server.ts` grava `echo_payload_hash` com validade curta;
  a importação que encontra aquele mesmo conteúdo confirma a publicação em vez de criar edição externa
  e não marca revisão de mídia nem cadastral suja.

### Leitura paginada e status
- `read.server.ts`: `fetchPropertyPage` recebe `status: "ativo" | "inativo" | "todos"`, e
  `fetchAllPropertyPages` percorre todas as páginas com teto e sinalização
  `paginacao_incompleta`; `fetchPropertyImages` passa a usar a leitura completa já existente em
  `image-ops.server.ts`.
- `import.server.ts`: varredura incremental só conclui com leitura confiável; ausência, erro ou
  leitura parcial geram `missing_remote_suspeito` (alerta), nunca remoção.

### Conta a conta (Cordial × Morar)
- `applyRemoteChanges` roda por publicação e grava diferenças entre contas como conflito de
  destino (`scope: "provider_mismatch"`) sem propagar ao outro destino.
- Campos específicos da publicação (código remoto, referência, URL, vínculos, galeria) continuam
  isolados por linha de `property_provider_publications`.

### Painel interno por imobiliária
- Novo `src/components/integracoes/ProviderOpsPanel.tsx` + server functions em
  `src/lib/imobibrasil/ops.functions.ts` (`getProviderOps`, `retryPublication`,
  `investigatePublication`, `listRemoteDuplicateDiagnosis`, `resolveFieldConflict`,
  `approveDuplicateRemoval`).
- Renderizado em `/_app/integracoes` atrás de `RequireModuleAccess` + `isAdminUser`; nenhuma rota
  pública e nenhuma exibição em telas de cliente.
- Recuperação reutiliza sempre o código remoto existente (`reconcilePublication`); nenhum caminho
  de recuperação chama inclusão.

### Duplicações e investigação
- `listRemoteDuplicateDiagnosis`: classifica em `local_duplicado`, `ids_diferentes_mesma_conta`,
  `repeticao_visual`, `publicacao_legitima_dois_sites`, com vínculos, referências, contagem de
  fotos e dependências (agenciamento, contrato, venda, agenda).
- `approveDuplicateRemoval`: remove um único item por vez, com confirmação explícita, conferência
  por leitura antes e depois, e bloqueio quando a classificação não é inequívoca.
- `investigatePublication`: leitura por conta, código, referência, filtro de status e permissão do
  token; relatório em tela, sem gravação.

### Registro de operações
- `logAttempt` consolidado em `property_sync_attempts` com `operation`, `property_id`, `provider`,
  `revision`, `reason`, `next_attempt_at`, `confirmed` — mensagens já passam por `sanitizeMessage`;
  revisão para garantir que nenhum token ou dado pessoal entre no registro.

### Testes e CI
- `package.json`: `test` passa a rodar todas as suítes por descoberta
  (`node --test --experimental-strip-types "src/**/*.test.ts"`), incluindo as suítes novas que hoje
  ficam fora do comando (payload-diff, update-contract, reference-lookup, queue-policy,
  duplicate-guard, remote-lookup, gallery-plan, gallery-cover-guard, photo-ops).
- Corrigir as duas falhas existentes (`module-menu.test.ts`, `corretores.test.ts`) e imports que
  impedem execução.
- Novas suítes de comportamento: reconciliação de três estados, supressão de eco, conflito com
  vitória do site, importação preservando limpeza local, paginação incompleta sem remoção,
  conflito entre contas, concorrência de revisão + transação de enfileiramento, timeout e 429.
- Workflow de CI em `.github/workflows/ci.yml`: typecheck + testes.

### Validação final real (imóvel 1381 Cordial / 3380 Morar)
Cadastrar, publicar nos dois, editar preço e descrição, limpar um campo, conferir proprietário
preservado, adicionar/substituir/excluir foto, alterar características, simular timeout e 429,
fechar o navegador durante o envio, recuperar falha em um destino, importar mudança externa,
resolver divergência e arquivar sem recriar anúncio — cada passo conferido por leitura nos dois sites.

## Entrega final
`docs/RELATORIO-INTEGRACAO-FINAL.md`: funcionalidades comprovadas com evidência por imobiliária,
migrações aplicadas, estado do sync e limitações reais da API — incluindo, de forma explícita, que
não há webhook de imóvel comprovado e que a ordem/capa só é garantida por reconstrução, portanto
essas partes não são declaradas autônomas.
