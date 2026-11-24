# Boletos Sicredi — prontidão de produção (Cordial e Morar)

Complementa a Fase 1 (já publicada). Nada de emissão real, publicação, secrets ou alteração em massa. Os três boletos sandbox existentes (incluindo o Morar `incerto`) só são lidos.

## 1. Contratos de marca "ambas" — migração 0109

Situação conferida: `rental_boleto_prepare` (0100) recusa qualquer contrato cuja marca não seja igual à da conta (`contract brand mismatch`); `preview.ts` bloqueia marca diferente de cordial/morar; `boletoContractAccess` já deixa secretária com qualquer marca operar contrato "ambas".

**Banco (`0109_rental_boleto_ambas.sql`, só `CREATE OR REPLACE FUNCTION`):**
- `rental_boleto_prepare` com a mesma assinatura, dono, `SECURITY DEFINER`, `search_path` e grants (só service_role). Regra nova: aceita `c.brand = acc.brand` OU (`c.brand = 'ambas'` e conta cordial/morar). Cordial→Morar e o inverso continuam recusados.
- Trava e "um título vivo por contrato × competência × ambiente" ficam idênticos (sem marca na chave) → trocar de conta exige baixar/rejeitar o título atual.
- `rental_boletos.brand` continua sendo a marca da conta; `marca_conta` e `marca_contrato` entram no snapshot e no evento de preparo.
- Conferência antes/depois via leitura de `pg_proc` (assinatura, `prosecdef`, dono, `proacl`). Journal preservado; nenhuma outra função tocada.

**Código:**
- `rules.ts`: `resolveIssuingBrand(contractBrand, chosen, agencies, admin)` → marca da conta ou recusa (sem escolha num "ambas"; escolha divergente num cordial/morar; secretária fora de `user_agencies`). `allowedIssuingBrands(...)` para a UI (pré-seleção só com marca única da secretária).
- `preview.ts`: aceita "ambas" quando há marca resolvida; prévia mostra `marca_conta`/`marca_contrato`; sem escolha → `ok=false` com motivo "Escolha a conta emissora".
- `boletos.functions.ts`: `previewBoleto` e `issueBoleto` recebem `issuingBrand` opcional; servidor resolve marca com `resolveIssuingBrand` antes de `pickIssuingAccount`; ambiente escolhido por marca (Cordial pode estar em produção e Morar em homologação).
- `flow.server.ts`: passa a marca resolvida à conta e ao snapshot.
- `BoletoConfirmModal.tsx`: seletor "Emitir pela conta: Cordial / Morar" só em contrato "ambas", vazio por padrão; botão Emitir bloqueado sem escolha; nova prévia ao trocar.
- `RentalEmissions.tsx`: deixa de esconder/bloquear "ambas"; passa a lista de marcas permitidas ao modal.
- `src/lib/boleto/AGENTS.md`: regra de "ambas" (escolha validada no servidor, chave sem marca).

## 2. Prontidão de produção (revisão + lacunas)

- **Testar conexão / Liberar emissão** (`connection.server.ts`, `releaseBillingAccount`, `BillingAccountsSettings.tsx`): conferir que 401/403 grava `auth_ok_em`/`consulta_ok_em` nulos, nunca liga `emissao_habilitada`, e mostra mensagem clara "Chave ou código de acesso de produção recusado pelo Sicredi". Ajustar só o texto/estado se faltar.
- **Confirmação inequívoca**: faixa de ambiente (PRODUÇÃO — título real / HOMOLOGAÇÃO — teste, sem valor), marca da conta, marca do contrato e pagador enviado (real em produção; fictício em homologação com aviso).
- **Dados incompletos**: aviso na homologação, bloqueio em produção, com link para a ficha do inquilino/imóvel do contrato (lista de campos faltantes: CPF/CNPJ, CEP, endereço, cidade/UF).
- Preservar: conciliação de `incerto`, nova tentativa do PDF, POST sem retry, linha sandbox oculta.

## 3. Baixa/cancelamento no Sicredi

Hoje não existe (`cobranca.server.ts`: "no instruction commands yet").
- **Proposta, condicionada ao manual**: `cobranca.server.ts → pedirBaixa(nossoNumero)` (timeout, sem retry, erro normalizado, log sem segredo/linha). Novo estado de evento via `rental_boleto_transition` (compare-and-set): `registrado → baixa_solicitada → baixado`; resposta perdida vira `incerto_baixa`, resolvida por consulta. Botão "Pedir baixa no banco" na ficha do boleto, admin/secretária, com confirmação e motivo. Em sandbox, só registra o retorno de demonstração sem mudar estado.
- Se a transição exigir novos valores de estado, isso entra na 0109 (aditivo, `CHECK` ampliado) — confirmar antes.
- **Não invento o endpoint**: antes de codar, confiro no manual oficial da Open API Cobrança Parceiros o caminho, método e corpo do pedido de baixa. Se o manual não for claro, essa parte fica de fora e vira pendência.
- Webhook: fora deste pedido.
- **Cron `liquidados/dia`**: recomendo **não** incluir agora e manter o botão "Conferir pagamentos do dia" — com produção ainda sem chave válida o cron só falharia, e o primeiro uso real deve ser acompanhado. Pode entrar depois (1x/dia, 07h, via `internal_worker_headers`, idempotente por `applyLiquidadosDia`).

## 4. Testes e validação

- `test:boleto` (vitest): `resolveIssuingBrand` (secretária com uma marca ok/negada, admin nas duas, cordial sem escolha ok, cordial forçado para Morar recusado, ambas sem escolha bloqueado), snapshot com `marca_conta`/`marca_contrato`, `pickIssuingAccount` produção vs sandbox por marca, pagador real só em produção, `incerto` sem reenvio, bloqueio por dados incompletos só em produção, baixa (se entrar).
- Banco: em transação com `ROLLBACK`, criar contrato "ambas" temporário e chamar `rental_boleto_prepare` com conta sandbox Cordial e Morar (segunda recusada pelo título vivo), Cordial→Morar recusado; nada gravado.
- Typecheck, build, `test:boleto`, `test:receipts`, NFS-e, Emissões, contratos/repasse/vistoria.
- Playwright na tela de Emissões em homologação (sem POST de produção). "Testar conexão" de produção só se você pedir; 401 esperado, não libera.
- Não publicar.

## Riscos
- Mudar `rental_boleto_prepare` afeta toda emissão → mesma assinatura, testes de banco revertidos e conferência de grants.
- Baixa no banco é irreversível → só com confirmação e endpoint confirmado no manual.

## Perguntas
1. Baixa: posso consultar o manual oficial na web para confirmar o endpoint, ou você envia o PDF do manual? Sem confirmação, fica fora.
2. Baixa no Sicredi deve também marcar o boleto como `cancelado` no Gestão automaticamente após confirmação do banco? (proposta: sim)
3. Confirma deixar o cron de liquidados para depois?

## Pendências que ficam com você
Chaves definitivas de produção, "Liberar emissão" por marca e o primeiro boleto real.
