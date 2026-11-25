# Plano: conferência de contrato sem fiador + competência única em Aluguéis

## 1) Corrigir "Marcar como conferido" (erro `populate_composite on a scalar`)

Causa confirmada na leitura: `materializeWorkspace` envia `"person": null` para seguro-fiança, caução e sem garantia; `rental_confirm_workflow_file` (0111, linha 285) faz `jsonb_populate_record(NULL::rental_guarantors, entry->'person')` com o null do JSON, e isso lança o erro. Nos outros casos (`property`, `contract`, cada locatário) o código atual sempre envia um objeto, mas a função não se protege.

### a) Migração 0114 `rental_confirm_workflow_file_null_person`
`CREATE OR REPLACE` com a mesma assinatura, mesmo `LANGUAGE plpgsql`, `search_path`, locks, mensagens e corpo, mudando só:
- `g := jsonb_populate_record(NULL::public.rental_guarantors, nullif(entry->'person','null'::jsonb));`
- em `tipo='fiador'` sem pessoa (`g IS NULL` / sem nome): `RAISE EXCEPTION 'Informe o fiador.' USING ERRCODE='22023';`
- defesa: se `property` ou `contract` não for objeto (`jsonb_typeof <> 'object'`) → `'Dados do aluguel incompletos. Salve o rascunho novamente.'` (22023); locatário não-objeto → mesma mensagem. Comportamento válido igual.
- Garantia que não é fiador continua com `guarantor_id` nulo (colunas aceitam).
- Grants/REVOKE reaplicados iguais aos atuais (lidos do banco antes de escrever).
- Revisão das outras funções do PR #51: `rental_save_workspace_draft`, `rental_register_workflow_file`, `rental_save_template_options` e `rental_workflow_*` não usam `jsonb_populate_record` (só a confirmação usa); serão relidas no banco e listadas no relato; sem mudança se não houver risco.
- A regra de caminho dos sites (rascunho em `.lovable/drafts`) passa a ser a 0115 e não entra agora.

### b) Código
- `src/lib/rentals/rentals.functions.ts`: `materializeWorkspace` omite `person` quando não há fiador; exportar a função (ou mover para `src/lib/rentals/workspace-materialize.ts`, puro) para testar.
- Novo `src/lib/rentals/workflow-errors.ts`: `friendlyWorkflowError(err)` — mantém as mensagens próprias em português já lançadas pela função (ex.: "Salve a revisão atual antes de conferir.", "Informe o fiador.") e troca qualquer mensagem crua do Postgres/rede por "Não foi possível conferir o contrato. Tente novamente; se persistir, avise o suporte." O erro técnico vai para `console.error` (navegador) e log do servidor.
- `RentalContractGenerator.tsx` / `useRentalDocuments.ts`: o toast e a mensagem na tela usam `friendlyWorkflowError`.

### c) Fluxo após a conferência (verificação, sem mudar regras)
Rascunho vira contrato (contrato, locatários, garantias, documentos migrados, rascunho removido), a pastinha abre o contrato, vistoria de entrada libera; saída segue a regra atual (entrada concluída + termo). Contrato já existente (não rascunho) também conferido no teste.
O rascunho 187e4b31 passa a funcionar sem alteração manual de dados.

## 2) Competência única na tela de Aluguéis

### URL e navegação (`src/routes/_app.alugueis.tsx`)
- `competencia` no `validateSearch` com a regex atual; ausente/inválida → `currentRentalCompetence()` (mês atual em São Paulo).
- Helper puro `src/lib/rentals/competence-nav.ts`: `parseCompetenciaParam`, `shiftCompetence(c, ±1)` (dez→jan, jan→dez), `formatCompetenceLong` ("novembro de 2026").
- Todas as `navigate` da rota (abrir/fechar pastinha, formulário, etapa vistorias, filtros) passam a usar a forma `search: (prev) => ({...prev, ...})`, preservando a competência.
- Memória em sessionStorage da última escolha, usada só quando a URL não traz o parâmetro (lida após hidratação).

### Seletor no topo
Novo `src/components/alugueis/CompetenceSwitcher.tsx`: botões mês anterior/próximo, rótulo por extenso, "Mês atual", `aria-label`s, setas do teclado, cabe no celular; tokens e estilo atuais.

### Pastinha controlada (`RentalExpandedDetails.tsx`)
- Props `competencia` e `onCompetenciaChange`; remove o estado local e o reset do `useEffect`.
- Na aba Emissões, chip "Competência: novembro de 2026" com troca ali mesmo (atualiza a URL; vale para as próximas pastinhas).
- `RentalEmissions` e o fluxo de NF recebem a competência exatamente como hoje. Nenhuma regra fiscal, de recibo, de boleto ou da competência padrão da NFS-e muda.

### Selos Recibo / Boleto / NF por competência nos cartões
- Nova função de leitura `listRentalCompetenceStatus({ competencia })` com `requireSupabaseAuth` e `context.supabase` (RLS do usuário): uma consulta por tipo filtrada pela competência (recibos em `rental_emissions`, boletos em `rental_boletos`, NF em `rental_nfse_emissions` só se `canSeeFinancialInsights`), devolvendo um mapa contrato → estado.
- Antes de implementar confirmo que cada tabela tem competência gravada de forma confiável; selo sem dado confiável fica de fora (e eu aviso).
- Mapeamento puro `competence-status.ts` (emitido / pendente / cancelado não conta como emitido).
- Filtro rápido "Pendentes nesta competência" (só sobre os selos exibidos).
- Estados de carregando/erro discretos; erro não esconde a lista.

## Testes
- Banco (`tests/sql/rental_confirm_workflow_file.sql`, padrão da suíte, BEGIN … ROLLBACK, claims simuladas): rascunhos sintéticos com seguro-fiança, caução, sem garantia, fiador com e sem cônjuge, fiador sem pessoa (espera "Informe o fiador."); confere contrato criado, locatários, garantias, documentos, rascunho removido, entrada liberável. Nada contra dados reais fora da transação.
- Vitest: `materializeWorkspace` sem `person`; `friendlyWorkflowError`; parse da competência (válida, inválida, ausente → mês atual SP, virada de mês); anterior/próximo; preservação em abrir/fechar pastinha e filtros; pastinha controlada; mapa dos selos.
- Fluxo conferido → vistoria de entrada liberada (teste da regra em `entry-inspection`).
- Depois: typecheck, build e suíte completa (inclui os 15 de fotos e os do PR #51). Sem publicar.

## Validação no preview
- Rascunho 187e4b31: "Marcar como conferido" → contrato criado e vistoria de entrada liberada (com sua sessão; isso grava o contrato real, então só faço com o seu OK no momento).
- Contrato 0ad62255: competência novembro/2026 escolhida no topo, abrir e fechar pastinhas, selos coerentes com a aba Emissões; celular.

## Riscos e rollback
- Função: rollback = nova migração recriando a definição da 0111 (guardada no plano de implementação). Risco baixo; só muda casos que hoje dão erro.
- Tela: mudança só de apresentação; reverter os arquivos. Selos podem ficar de fora se o dado não for confiável.
- Não toca fotos (PR #50), regra 0113, Emissões, sync Imobi nem crons.

## Arquivos
Novos: `drizzle/migrations/0114_*.sql`, `workflow-errors.ts`, `competence-nav.ts`, `competence-status.ts`, `CompetenceSwitcher.tsx`, função de status em lote, testes.
Alterados: `rentals.functions.ts`, `RentalContractGenerator.tsx`, `useRentalDocuments.ts`, `_app.alugueis.tsx`, `RentalExpandedDetails.tsx`, `RentalCard`, `src/lib/rentals/AGENTS.md`/raiz (regra da competência única).
