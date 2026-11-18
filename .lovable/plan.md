# Boletos Sicredi — Fase 1 (conexão, consulta e emissão protegida por chave)

## Estado atual confirmado
- `src/lib/boleto/provider.ts`: interface genérica, `boletoProvider = null` (sem emissão).
- `RentalEmissions.tsx`: o card de boleto usa `contract.comissaoMensal` (linhas 381/431) — valor errado para boleto do inquilino.
- `0008_rental_emissions.sql`: `authenticated` tem INSERT/UPDATE/DELETE (dono do contrato ou admin). Grants de `anon` citados no pedido: conferir por SELECT em `information_schema.role_table_grants` no 1º passo antes de revogar.
- Nenhum secret `SICREDI_*` existe no código. Última migração do journal: `0098`.

## O que será feito (resumo)
1. Conta bancária por marca × ambiente, com emissão desligada por padrão.
2. Botão "Testar conexão" (só leitura) para cada conta.
3. Emissão completa no sandbox; produção só após liberação manual do admin.
4. Card de boleto passa a usar o total do inquilino.
5. Conciliação manual (liquidados/dia) que só marca evidência, sem baixar o aluguel.

## Migrações (aditivas, journal preservado)
**0099_billing_accounts**
- `billing_accounts`: brand (`cordial|morar`), ambiente (`sandbox|producao`), apelido, `beneficiario_mascara`, `cooperativa_mascara`, `posto_mascara` (só projeção), `configurado`, `autenticado_em`, `consulta_ok_em`, `emissao_habilitada` default false, `liberado_por/em`, `encargos jsonb` (tipoJuros, tipoJurosPercentual, juros, diasInicioJuros, tipoMulta, multa, diasInicioMulta, `ativo` default false), unique(brand, ambiente).
- `billing_account_events`: auditoria de alterações de conta e liberação.
- GRANT SELECT para authenticated + policy admin-only; escrita só service_role; política RESTRICTIVE `meta_reviewer_block` e bloqueio `atendimentos_viewer`.

**0100_rental_boletos**
- `rental_boletos`: contract_id, account_id, brand, ambiente, competencia, ocorrencia, `seu_numero` determinístico (10 caracteres), `id_titulo_empresa` (25), estado (`preparando|enviando|registrado|incerto|rejeitado|baixa_solicitada|baixado|liquidado`), `pdf_estado` (`pendente|pronto|erro`), `snapshot jsonb` imutável (pagador, composição, total_centavos, vencimento, encargos enviados), nosso_numero, linha_digitavel, codigo_barras, `pdf_path`, `liquidacao_evidencia jsonb`, emission_id → rental_emissions.
- Índices únicos: (contract_id, competencia, ocorrencia, ambiente) WHERE estado não terminal-negativo; (account_id, ambiente, nosso_numero).
- Gatilho que impede alteração do snapshot.
- `rental_boleto_events`: transição de/para, operador, código HTTP, mensagem mascarada.
- SELECT pelo mesmo critério de contrato do `rental_emissions`; escrita só service_role; políticas restritivas dos perfis bloqueados.

**0101_rental_emissions_boleto_guard**
- Substituir policies de INSERT/UPDATE/DELETE com `AND tipo <> 'boleto'` (recibo e NFS-e seguem iguais); REVOKE de `anon` se existir.

## Secrets (formulário seguro, nunca no chat)
`SICREDI_SANDBOX_API_KEY`; `SICREDI_CORDIAL_API_KEY`, `_CODIGO_BENEFICIARIO`, `_COOPERATIVA`, `_POSTO`, `_CODIGO_ACESSO`; idem `SICREDI_MORAR_*` depois. Ausência de qualquer um ⇒ "não configurado". Sem fallback entre marcas. Credenciais do sandbox: valores fixos públicos do manual §7.1/§7.2 em constante do servidor (mais a chave de sandbox).

## Arquivos
- `src/lib/boleto/sicredi/config.server.ts` — hosts fechados por ambiente (`/sb` no sandbox), lê secrets por marca, máscaras.
- `token.server.ts` — password/refresh, cache em memória do isolate por (marca, ambiente) com promessa única (trava contra concorrência), margem de 60 s sobre `expires_in`; sem persistir no banco (apenas reautentica num isolate novo).
- `http.server.ts` — timeout 15 s, `redirect: "manual"`, erros normalizados 400/401/404/422/429/5xx em português, 429 com backoff limitado só para GET; logs sem token, chave nem linha completa.
- `cobranca.server.ts` — cadastrar, consultar v1, cadastrados, pdf, liquidadosDia.
- `body.ts` (puro) — monta o corpo: `tipoCobranca=NORMAL`, `especieDocumento=RECIBO` fixo, valor = total centavos; encargos só se `ativo`.
- `linha-digitavel.ts` (puro) — 47 dígitos + dígitos verificadores.
- `src/lib/rentals/tenant-total.ts` (puro) — total do inquilino por ocorrência reaproveitando `computeReceiptTotals`.
- `src/lib/boleto/boletos.functions.ts` — serverFns autenticadas: `testBillingConnection`, `saveBillingAccount`, `releaseBillingAccount` (admin), `previewBoleto`, `issueBoleto`, `refreshBoleto`, `retryBoletoPdf`, `reconcileBoleto`, `getBoletoPdfUrl`, `runLiquidadosDia` (admin). Marca vem do contrato no servidor.
- `src/lib/boleto/AGENTS.md` — regras do módulo; linha no AGENTS.md raiz.
- UI: `src/components/configuracoes/BillingAccountsSettings.tsx` (contas, Testar conexão, encargos, liberação); `BoletoConfirmModal.tsx`; ajustes no card do `RentalEmissions.tsx` (total, selo HOMOLOGAÇÃO, Copiar linha, Abrir PDF, "Registrado • PDF pendente", Atualizar situação).

## Fluxo de emissão
```text
previewBoleto → validações → service_role grava rental_boletos 'preparando' + evento (commit)
 → 'enviando' → POST cadastro (sem retry)
   ok      → 'registrado' + PDF (falha de PDF ≠ falha do título)
   4xx     → 'rejeitado'
   timeout/corpo inválido → 'incerto'
'incerto' → só reconcileBoleto (GET cadastrados por seuNumero) → registrado ou liberado manualmente
```
Bloqueios: parcela paga, total ≤ 0, conta não configurada/liberada (produção), pagador sem CPF/CNPJ/endereço/CEP (indicando campo e tela).

## Testar conexão
Token → `GET liquidados/dia` do último dia útil, página 1. Grava `autenticado_em` e `consulta_ok_em`; nunca cadastro. Mostra "Token OK ≠ cobrança habilitada".

## Testes
- Unitários (fetch simulado): username 5+4, headers, form-urlencoded; expiração/refresh e trava; erros e 429; linha digitável; PDF; total 2.050 (aluguel 2.000, comissão 200, +100, −50), proporcional, dia 31, fevereiro; RECIBO fixo; encargos omitidos/enviados sem dupla soma.
- Concorrência (banco): duplo clique e duas abas ⇒ 1 título; timeout ⇒ incerto sem reenvio.
- Permissões: anônimo, operador sem acesso, outra marca, PDF de outro contrato negados; `INSERT rental_emissions tipo='boleto'` pelo navegador negado; recibos/NFS-e: suítes existentes.
- Morar sem secrets ⇒ não configurado.
- Sandbox real (com a chave): token → cadastro → consulta → PDF.
- Produção Cordial: só Testar conexão.
- Build, typecheck, suíte completa; relatório por cenário.

## Riscos
- Cache de token só no isolate: vários isolates autenticam em paralelo (aceitável; sem persistência cifrada nesta fase).
- Timeout pós-POST pode gerar título real: mitigado por seuNumero determinístico + reconciliação obrigatória.
- Mudança de policy em `rental_emissions` pode afetar recibos: coberto por testes e por condição `tipo <> 'boleto'`.
- Limite 20 TPS: uma emissão por clique, sem lote.

## Perguntas em aberto
1. Formato do `seuNumero` (10 caracteres): proposta = base36 de contrato+competência+ocorrência. Ok?
2. Vencimento do boleto = dia de vencimento do contrato na competência? E se já passou?
3. Quem pode emitir: só admin/secretária ou também o responsável do contrato?
4. Encargos: `dataInicioJuros/Multa` em dias após o vencimento (padrão 1)?
5. Conta de produção Cordial começa com `emissao_habilitada=false` e o piloto será qual contrato?
