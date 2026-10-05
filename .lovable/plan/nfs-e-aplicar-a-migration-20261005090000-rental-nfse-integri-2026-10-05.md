# NFS-e: aplicar a migration `20261005090000_rental_nfse_integrity.sql` com segurança

Somente plano. Nada é aplicado, gravado ou publicado até o Leonardo aprovar.

## 0. Conferido agora (somente leitura)
- Confirmado: o schema `fiscal_private`, a tabela `rental_nfse_service_references` e as colunas `last_payment_reference_id` / `fiscal_profile` / `config_version` / `issuer_identity` **não existem**.
- Confirmado: `markRentalPaymentPaid` (rentals.functions.ts:894) lê `last_payment_reference_id`. Por isso, hoje a baixa de aluguel no preview **falha** com a mensagem "Não foi possível preparar a baixa…". A falha é segura (não grava nada), mas a função fica inutilizável.
- `src/integrations/supabase/types.ts` ainda não conhece essas colunas e tabelas: zero ocorrências.
- O arquivo tem 459 linhas, com `BEGIN; … COMMIT;` próprios, e **não é idempotente**: tem `ADD COLUMN` e `CREATE FUNCTION/TRIGGER/INDEX` sem `IF NOT EXISTS`, e `DROP/ADD CONSTRAINT` de FK.
- Correção ao item 5 do contexto: a migration Morar já **foi aplicada hoje** neste banco, pela ferramenta de migration do Lovable. Ela ficou registrada como `drizzle/migrations/0002_morar_owned_site.sql`, e o arquivo `supabase/migrations/20261004150000_…` saiu da pasta.

## 1. Decisão necessária: como aplicar
O único caminho de schema que o agente tem neste projeto é a ferramenta de migration do Lovable. Ela grava o arquivo em `drizzle/migrations/` e aplica no Cloud. Não há outra via aprovada para rodar DDL. A exigência "NÃO drizzle / registrar em supabase_migrations" não pode ser cumprida literalmente.
- **Opção A (recomendada):** passar o conteúdo do arquivo **byte a byte** para a ferramenta. O mesmo SQL é reconhecido como a mesma migration, evitando uma segunda aplicação. Se houver aviso por causa do `BEGIN/COMMIT` interno, nada é removido sem nova aprovação.
- **Opção B:** remover só as linhas `BEGIN;`/`COMMIT;`, como foi feito na Morar. A ferramenta já roda tudo em transação. O preço é perder o reconhecimento como o mesmo arquivo. Nesse caso, o arquivo `supabase/migrations/20261005090000_…` sai da pasta, igual à Morar, para não haver reaplicação.

## 2. Pré-checagens antes de aplicar (somente leitura)
1. Nenhuma emissão em `processando`/`incerto`. Hoje são 0, mas a contagem é refeita na hora de aplicar.
2. As FKs `rental_nfse_emissions_contract_id_fkey` e `rental_nfse_emission_events_emission_id_fkey` existem com esse nome exato. O `DROP CONSTRAINT` falha se o nome for outro.
3. Os índices únicos novos não colidem com dados atuais. Todos são parciais: `issuer_identity IS NOT NULL` e `snapshot … IS NOT NULL`. Como essas colunas nascem nulas, não há colisão.
4. A nova CHECK de eventos exige `to_status` preenchido nas linhas do tipo `transition`. As linhas atuais ganham `evidence_kind='transition'` por padrão, então é preciso confirmar 0 eventos com `to_status` nulo.
5. Nenhum contrato com `payment_status='pago'` vai sofrer UPDATE durante a aplicação: o novo gatilho só age em UPDATEs futuros.
6. Guardar as definições atuais de GRANT, RLS e políticas de `rental_nfse_emissions`/`events`, para comparação e eventual reversão.

Se qualquer item falhar, a aplicação para e o Leonardo é avisado. Nada é contornado por conta própria.

## 3. O que a migration cria ou muda (resumo)
- **Schema `fiscal_private`:** sem acesso para anon nem authenticated.
- **`nfse_provider_settings`:**
  - novas colunas `fiscal_profile`, `config_version`, `fiscal_approved_*` e `production_authorized_*`;
  - remove os DEFAULTs do item da lista, da alíquota e do IBS/CBS (valores atuais preservados);
  - 4 gatilhos novos: versão, aprovação, produção e proibição de exclusão.
- **`rental_nfse_service_references`** (nova): só INSERT e SELECT pelo servidor; registros que não podem ser alterados nem apagados.
- **`rental_contracts.last_payment_reference_id`:** novo gatilho `rental_payment_fiscal_reference`. Ao dar baixa, ele grava a referência histórica (vencimento original, comissão e retrato do inquilino). Se faltar `proximo_vencimento`, a baixa é recusada.
- **`rental_nfse_emissions`:**
  - FK do contrato passa a ser `ON DELETE RESTRICT`;
  - 12 colunas novas (issuer_identity, snapshot, config_version, attempt_id, entre outras);
  - 3 índices únicos parciais;
  - gatilhos `nfse_protect_operation` e `nfse_record_transition`;
  - o navegador passa a ler só colunas permitidas (sem XML nem resposta bruta);
  - ninguém pode mais apagar emissões (a política de DELETE do admin sai).
- **`rental_nfse_emission_events`:** FK `RESTRICT`, colunas `attempt_id` e `evidence_kind`, nova CHECK de semântica, gatilho de retenção e acesso de leitura removido do navegador.
- **Sem backfill:** nenhuma competência, emissor ou perfil fiscal é inventado.

## 4. Verificação logo após aplicar (somente leitura)
- Objetos existem: schema, tabela, 13 colunas, gatilhos (`nfse_settings_10_version`, `_20_approval`, `_30_production`, `nfse_settings_retain`, `rental_payment_fiscal_reference`, `nfse_protect_operation`, `nfse_record_transition`, `nfse_retain_events`, `nfse_retain_references`) e os 3 índices.
- Grants: `authenticated` lê só as colunas permitidas de emissions e não lê events nem references; `service_role` não pode apagar.
- RLS ligado nas tabelas novas.
- Dados intactos:
  - 2 linhas de configuração, com `modo_teste=true` e item `10.05.01`;
  - 12 emissões (6 erro, 6 teste_ok);
  - 62 contratos;
  - contagem de eventos igual à de antes.
- `types.ts` regenerado pela ferramenta. Conferir que contém `last_payment_reference_id` e `rental_nfse_service_references`.

## 5. Ajustes de código (só se a verificação mostrar falta real)
1. **Baixa:** depois do UPDATE em `markRentalPaymentPaid`, reler a linha e exigir `last_payment_reference_id` preenchido e diferente do anterior. Se não estiver, mostrar o erro "baixa não registrada" e não avisar sucesso. Teste unitário cobrindo isso.
2. **Telas:** procurar leituras de `rental_nfse_emissions` com `select("*")` ou com colunas fora da lista permitida, e de `rental_nfse_emission_events` pelo navegador. Trocar por colunas explícitas ou por leitura no servidor, para a tela de NFS-e não quebrar com os novos grants.
3. **Preservar sem tocar:**
   - `buildBasicAuthHeader`;
   - `normalizeItemListaServico` (somente dígitos, desdobramento de 4 ou 6, por exemplo `10.05.01 → 100501`);
   - decodificação ISO-8859-1 das respostas IPM.
   Rodar os testes que cobrem esses três pontos.

## 6. Validação (sem emissão real)
- `test:nfse` (esperado ≥125 aprovados), `test` com TZ=America/Sao_Paulo, `test:site` e o type check.
- No preview, conferir que a baixa é concluída e cria uma referência. Isso grava no banco: só mediante autorização explícita, num contrato indicado pelo Leonardo.

## 7. Configuração e aprovação dos perfis fiscais (após a migration, com o Leonardo e o contador)
Por empresa (Cordial e Morar), na tela de Integrações:
- **Conferir:** operação, tomador, origem, elegibilidade, descrição, regime, localPrestacao, layout, retenções e IBS/CBS.
- **Aprovar:** `approvalReference` com 15 caracteres ou mais, feita por um admin.
- **Manter** `modo_teste=true`.
- **Confirmar com o contador:**
  - inscrição municipal real (hoje está igual ao CNPJ; a da Morar historicamente aparece como 26750);
  - código do item, se `100501` ou `10.05.01`.
- **Confirmar que os segredos existem:** `IPM_NFSE_LOGIN_CORDIAL`, `IPM_NFSE_SENHA_CORDIAL`, `IPM_NFSE_LOGIN_MORAR`, `IPM_NFSE_SENHA_MORAR`. Só presença, sem ler os valores.
- **Teste IPM em modo teste:** Cordial R$100 e Morar R$85, só depois dos perfis aprovados e de autorização explícita.

## 8. Ordem segura
```text
1 pré-checagens -> 2 aplicar + verificar -> 3 ajustes de código + testes
-> 4 validar baixa no preview -> 5 configurar/aprovar perfis
-> 6 teste IPM em modo teste -> 7 Leonardo autoriza publicar
```
Nunca na ordem inversa. Até a etapa 2 terminar, ninguém deve usar a baixa de aluguel no preview.

## Riscos
- **Aplicação pela metade:** coberto pela transação. Se algo falhar, nada fica aplicado.
- **Reaplicação:** a migration não é idempotente. Nunca rodar de novo; se falhar, analisar antes de tentar outra vez.
- **Tela de NFS-e quebrar** pelos novos grants: item 5.2.
- **Contrato com histórico fiscal** não pode mais ser excluído: é a intenção. Para esses casos, usar "Encerrar contrato".
- **Baixa recusada sem `proximo_vencimento`:** hoje há 0 contratos ativos nessa situação. Recontar na hora de aplicar.

## O que NÃO fazer
- Não publicar nem fazer deploy.
- Não desligar o modo teste, não habilitar produção, não emitir nota real.
- Não pausar a sincronização ImobiBrasil.
- Não fazer backfill nem alterar dados em massa.
- Não ler nem alterar segredos.
- Não reexecutar a migration às cegas.
- Não mexer em Basic auth, no item da lista nem no ISO-8859-1.
