# Plano: conferência de contrato sem fiador + competência única em Aluguéis

## 1) Corrigir "Marcar como conferido" (erro `populate_composite on a scalar`)

Causa confirmada: `materializeWorkspace` envia `"person": null` para seguro-fiança, caução e sem garantia; `rental_confirm_workflow_file` faz `jsonb_populate_record(NULL::rental_guarantors, entry->'person')` com o null do JSON e lança o erro. No banco, `rental_confirm_workflow_file` é a única função `rental_*` que usa `jsonb_populate_record` (confirmado no catálogo); `rental_save_workspace_draft`, `rental_register_workflow_file`, `rental_save_template_options` e `rental_workflow_*` não têm esse risco e não mudam.

### Número da migração
Confirmado: `drizzle/migrations` termina na 0113; o ledger aplicado tem 114 entradas (0000–0113, incluindo a 0113 da policy); `supabase/migrations` está fora do journal e não colide. Próximo número: **0114**. O arquivo em `.lovable/drafts` não entra neste trabalho.

### a) Migração 0114 `rental_confirm_workflow_file_null_person`
- Antes de escrever: ler `pg_get_functiondef` da definição ATUAL no banco e guardar no próprio arquivo como comentário de rollback.
- `CREATE OR REPLACE` partindo dessa definição atual, preservando exatamente: assinatura, `LANGUAGE plpgsql`, sem SECURITY DEFINER (hoje é invoker), `SET search_path = public`, owner `postgres`. `CREATE OR REPLACE` mantém owner e grants; hoje EXECUTE só para `postgres` e `service_role` — nenhum GRANT novo, nada para anon/authenticated. Validação pós-migração compara `proacl`, `prosecdef`, `proconfig` e owner com os atuais.
- Mudanças, só estas:
  - `g := jsonb_populate_record(NULL::public.rental_guarantors, nullif(entry->'person','null'::jsonb));`
  - `tipo='fiador'` sem pessoa → `RAISE EXCEPTION 'Informe o fiador.' USING ERRCODE='22023';`
  - `property`, `contract` ou um locatário que não seja objeto JSON → `'Dados do aluguel incompletos. Salve o rascunho novamente.'` (22023). Caminho válido inalterado.
- Garantia que não é fiador continua com `guarantor_id` nulo (colunas aceitam).

### b) Código
- `rentals.functions.ts`: `materializeWorkspace` omite `person` quando não há fiador; lógica movida para `src/lib/rentals/workspace-materialize.ts` (pura) para testar.
- Novo `src/lib/rentals/workflow-errors.ts`: `friendlyWorkflowError(err, acao)` — mantém as mensagens próprias em português da função e do app; troca mensagem crua do Postgres/rede por texto amigável por ação ("Não foi possível conferir/anexar/gerar o contrato ou salvar o rascunho. Tente novamente; se persistir, avise o suporte."). Erro técnico vai para `console.error` e log do servidor.
- `RentalContractGenerator.tsx` / `useRentalDocuments.ts`: o mesmo tratamento e o mesmo componente de erro em conferir, anexar contrato, gerar contrato e salvar rascunho.

### c) Fluxo após a conferência (verificação, sem mudar regras)
Rascunho vira contrato (contrato, locatários, garantias, documentos migrados, rascunho removido), a pastinha abre o contrato, vistoria de entrada libera; saída segue a regra atual. Contrato já existente (não rascunho) também coberto no teste.
O rascunho 187e4b31 passa a funcionar sem alteração manual de dados.

## 2) Competência única na tela de Aluguéis

### URL e navegação (`src/routes/_app.alugueis.tsx`)
- `competencia` no `validateSearch` com a regex atual; ausente/inválida → `undefined` na URL e valor efetivo `currentRentalCompetence()` (mês atual em São Paulo). O mês atual não é gravado na URL.
- Helper único e testado `rentalSearch(prev, patch)` em `src/lib/rentals/rental-search.ts`: sempre carrega `competencia` + filtros (`corretorId`, `periodo`, `imobiliaria`, `status`); `id`, `formulario` e `etapa` vêm só do `patch` (nunca herdados).
- Cada navegação da rota:

| Ação | Resultado |
|---|---|
| Abrir formulário (linha 112) | `formulario`, filtros, competência; sem `id`/`etapa` |
| Abrir pastinha (128) | `id`, filtros, competência; sem `formulario`/`etapa` |
| Fechar pastinha (137, replace) | filtros, competência; remove `id`, `formulario`, `etapa` |
| Após salvar → vistorias (316) | `id`, `etapa=vistorias`, filtros, competência |
| Fechar formulário (322, replace) | filtros, competência; remove `formulario`, `id`, `etapa` |
| Mudar filtro | filtro novo, demais filtros, competência, `id` atual se houver |
| Mudar competência (topo ou pastinha) | competência nova, resto igual |

- sessionStorage: grava a última escolha; após hidratação, uma única vez (ref de controle), se a URL não tiver `competencia` e houver valor salvo diferente do mês atual, `navigate({ replace: true })`. Sem loop; a consulta usa o valor da URL, então não há busca dupla visível além da troca de chave. URL é a fonte da verdade.

### Seletor no topo
Novo `CompetenceSwitcher.tsx`: botões mês anterior/próximo, rótulo por extenso ("novembro de 2026"), "Mês atual", e o `input type=month` para escolher mês/ano direto. `aria-label`s; setas do teclado só quando o próprio seletor está focado (nada global). Cabe no celular; tokens atuais.

### Pastinha controlada (`RentalExpandedDetails.tsx`)
- Props `competencia` e `onCompetenciaChange`; remove o estado local (linha 419) e o reset do `useEffect` (441).
- Na aba Emissões, chip "Competência: novembro de 2026" com o mesmo seletor; trocar ali atualiza a URL e vale para as próximas pastinhas.
- `RentalEmissions` e o fluxo de NF (`onNf` → `nfRequest {competencia, nonce}`) recebem a competência exatamente como hoje. Nenhuma regra fiscal, de recibo, de boleto ou da competência padrão da NFS-e muda.

### Selos por competência nos cartões
Dados confirmados no banco (tabelas e valores permitidos):
- **Recibo** — `rental_emissions` (`tipo`, `status` ∈ emitindo/emitido/erro, `competencia`). Emitido = existe linha `tipo='recibo'` e `status='emitido'`; `emitindo` = "em andamento"; erro ou nada = pendente.
- **Boleto** — `rental_boletos` (`estado` ∈ preparando/enviando/registrado/incerto/rejeitado/baixa_solicitada/baixado/liquidado, `ambiente`). Selo só aparece quando a trava atual de produção está aberta para a marca do contrato: a mesma usada por `rental_boleto_prepare` ("production issuance disabled"), ou seja conta da marca em `billing_accounts` com `ambiente='producao'` e `liberado_em` preenchido. Sem isso (hoje), nenhum selo de boleto e nada conta como pendente. Quando ativo: só `ambiente='producao'`; registrado/liquidado = emitido (liquidado = "pago"); preparando/enviando/incerto = "em andamento"; rejeitado/baixa_solicitada/baixado ou nada = pendente.
- **NF** — `rental_nfse_emissions` (`status` ∈ teste_ok/emitida/erro/cancelada/processando/incerto/nao_emitida). Só para quem `canSeeFinancialInsights`. Se a marca está em modo teste (`nfse_provider_settings.modo_teste`, a mesma configuração que hoje força teste), mostra "NF teste" apenas informativo (com `teste_ok` = "teste ok") e não conta como pendente. Em produção: emitida = emitida; processando/incerto = "em andamento"; erro/cancelada/nao_emitida ou nada = pendente.
- Selos só para contratos ativos ou pendentes de assinatura; encerrados, vencidos, cancelados e arquivados não recebem selo nem entram no filtro.
- Nova função `listRentalCompetenceStatus({ competencia, contractIds })` com `requireSupabaseAuth` e `context.supabase` (RLS do usuário): três consultas em lote (`in contract_id` limitado aos contratos visíveis/filtrados, máx. 200 por chamada), sem N+1. Mapeamento puro em `competence-status.ts`.
- `queryKey ['rentals','competence-status', competencia, contractIdsHash]`; invalidada (`['rentals','competence-status']`) ao emitir recibo, boleto ou NF na pastinha.
- Filtro rápido "Pendentes nesta competência" com contador (ex.: "12 pendentes"): conta só os selos efetivamente exibidos — recibo sempre; boleto e NF só quando ativos em produção; "NF teste" nunca conta.
- Carregando/erro discretos; erro não esconde a lista.

## Testes
- Banco (`tests/sql/rental_confirm_workflow_file.sql`, padrão da suíte, BEGIN … ROLLBACK, claims simuladas): rascunhos sintéticos com seguro-fiança, caução, sem garantia, fiador com e sem cônjuge, fiador sem pessoa (espera "Informe o fiador."); confere contrato, locatários, garantias, documentos, rascunho removido e entrada liberável. Também confere owner/SECURITY/search_path/grants da função.
- Vitest: `materializeWorkspace` sem `person`; `friendlyWorkflowError` nas quatro ações; parse da competência (válida, inválida, ausente → mês atual SP, virada de mês); anterior/próximo (dez→jan, jan→dez); `rentalSearch` para cada linha da tabela; pastinha controlada; mapeamento dos selos com cada status real; boleto oculto com trava fechada; "NF teste" fora do contador; contratos encerrados sem selo; contador do filtro.
- Regressão NFS-e/boleto: a competência escolhida chega igual em `nfRequest`/`RentalEmissions`; regras atuais de competência futura e padrão da NFS-e e do boleto inalteradas (testes existentes + um novo de passagem da competência).
- Fluxo conferido → vistoria de entrada liberada (regra em `entry-inspection`).
- Depois: typecheck, build e suíte completa (inclui os 15 de fotos e os do PR #51). Sem publicar.

## Validação no preview
- Rascunho 187e4b31: NÃO clico "Marcar como conferido" (fica para o dono). A chamada da função com o payload desse rascunho só roda no banco compartilhado se a ferramenta garantir uma transação explícita BEGIN … ROLLBACK sem commit automático; se não garantir, não rodo e valido só no PostgreSQL isolado da suíte. O relato final diz qual caminho foi usado.
- Contrato 0ad62255: competência novembro/2026 escolhida no topo, abrir/fechar pastinhas, trocar no chip, selos coerentes com a aba Emissões; celular.

## Riscos e rollback
- Função: rollback = nova migração com a definição atual lida do banco (guardada no arquivo da 0114). Só muda casos que hoje dão erro.
- Tela: só apresentação e uma leitura nova; reverter os arquivos.
- Não toca fotos (PR #50), policy da 0113, Emissões, contratos/vistorias do PR #51 além do item 1, sync Imobi nem crons.

## Arquivos
Novos: `drizzle/migrations/0114_*.sql`, `workspace-materialize.ts`, `workflow-errors.ts`, `rental-search.ts`, `competence-nav.ts`, `competence-status.ts`, `CompetenceSwitcher.tsx`, função de status em lote, testes (SQL e vitest).
Alterados: `rentals.functions.ts`, `RentalContractGenerator.tsx`, `useRentalDocuments.ts`, `_app.alugueis.tsx`, `RentalExpandedDetails.tsx`, `RentalCard`, `src/lib/rentals/AGENTS.md` (regra da competência única na URL).
