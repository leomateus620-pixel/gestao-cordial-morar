## Objetivo

Permitir cadastrar **múltiplos locatários** e **múltiplos garantidores** (fiador, caução, seguro fiança) por contrato de aluguel, com persistência real no banco e reflexo em todos os pontos vinculados (formulário, card, drawer de detalhes, KPIs, documentos, listagens).

## Modelo de dados (migration)

Duas novas tabelas de junção; mantemos as colunas antigas por compatibilidade e as tratamos como "principais" (primary) para não quebrar o fluxo atual.

```text
rental_contract_tenants        rental_contract_guarantors
------------------------       -------------------------------
id (uuid pk)                   id (uuid pk)
contract_id  → rental_contracts(id) ON DELETE CASCADE
tenant_id    → rental_tenants(id)   guarantor_id → rental_guarantors(id)
is_primary boolean default false    tipo rental_guarantee_type  (fiador | caucao | seguro_fianca)
created_at, updated_at              valor_caucao numeric(12,2) null
UNIQUE (contract_id, tenant_id)     seguro_seguradora text null
                                    seguro_apolice text null
                                    seguro_valor_mensal numeric(12,2) null
                                    is_primary boolean default false
                                    created_at, updated_at
                                    UNIQUE (contract_id, guarantor_id, tipo)
```

- GRANTs para `authenticated` (select/insert/update/delete) + `service_role` ALL.
- RLS: `created_by` implícito via contrato — política usando `EXISTS (SELECT 1 FROM rental_contracts c WHERE c.id = contract_id AND c.created_by = auth.uid())` para todos os comandos.
- Trigger `updated_at`.
- Backfill: para cada contrato existente, inserir 1 linha em `rental_contract_tenants` (tenant_id atual, is_primary=true) e, quando `garantia_tipo <> 'sem_garantia'`, 1 linha em `rental_contract_guarantors` copiando garantidor/valores atuais.
- Manter `rental_contracts.tenant_id`, `guarantor_id`, `garantia_tipo`, `valor_caucao`, `seguro_*` — passam a refletir o registro "principal" (índice 0). A `UNIQUE` de contrato ativo por imóvel continua igual.

## Tipos (`src/types/rental.ts`)

Adicionar:

```ts
type ContractGuarantee = {
  id?: string;
  tipo: "fiador" | "caucao" | "seguro_fianca";
  guarantor?: { existingId?: string | null; data?: RentalGuarantorInput } | null; // fiador
  valorCaucao?: number | null;                                                    // caucao
  seguroSeguradora?: string | null;                                               // seguro_fianca
  seguroApolice?: string | null;
  seguroValorMensal?: number | null;
};

type ContractTenantRef = { existingId?: string | null; data?: RentalTenantInput };
```

Estender `RentalContractInput`:
- `tenants: ContractTenantRef[]` (mín. 1; o primeiro = principal).
- `guarantees: ContractGuarantee[]` (0..N; substitui `guarantor`, `garantiaTipo` e campos soltos de seguro/caução — mantidos como opcionais para retro-compat, derivados do primeiro item).

Estender `RentalContractFull`:
- `tenants: RentalTenant[]` (todos, ordem estável, principal primeiro).
- `guarantees: Array<{ tipo, guarantor: RentalGuarantor|null, valorCaucao, seguroSeguradora, seguroApolice, seguroValorMensal, isPrimary }>`.
- Manter `tenant`, `guarantor`, `garantiaTipo` etc. como aliases do primário para não quebrar consumidores atuais (card, filtros de busca).

## Server functions (`src/lib/rentals/rentals.functions.ts`)

- `createRentalContract`: após criar contrato, inserir todos os tenants em `rental_contract_tenants` (primeiro `is_primary=true`) e todas as garantias em `rental_contract_guarantors` (criando `rental_guarantors` quando necessário; para `caucao`/`seguro_fianca` `guarantor_id` é NULL). O primário do contrato (`tenant_id`, `guarantor_id`, `garantia_tipo`, `valor_caucao`, `seguro_*`) reflete o item 0 de cada lista.
- `updateRentalContract`: aceitar mesmas listas; estratégia simples "replace" — apagar linhas do contrato nas duas junções e reinserir, mantendo/atualizando o principal em `rental_contracts`.
- `listRentalContracts`: além dos joins atuais, carregar `rental_contract_tenants` + `rental_contract_guarantors` do lote e hidratar `tenants[]` e `guarantees[]` no `RentalContractFull`. Backfill garante que contratos antigos apareçam com um item cada.
- Validação: `tenants.length >= 1`; para `fiador` exigir `guarantor.data.nome` ou `existingId`; `caucao` exige `valorCaucao > 0`; `seguro_fianca` exige `seguroSeguradora`. Regra de contrato ativo único por imóvel permanece.

## Formulário (`src/components/alugueis/RentalFormModal.tsx`)

Reescrever as seções **Locatário** e **Garantia** para trabalhar com arrays de itens:

- **Locatários** (nova UI): lista vertical de cards de locatário; cada card com o `ModeToggle` (Existente/Novo) e os campos atuais; botão "＋ Adicionar locatário" no rodapé da seção; botão remover em cada card extra (mín. 1). Primeiro locatário rotulado como "Principal".
- **Garantias** (substitui a seção atual): lista de cards; cada card com seletor `Sem garantia / Fiador / Caução / Seguro fiança` (mesma UI do toggle atual, mas por item), e campos condicionais idênticos aos de hoje. `Sem garantia` como item não faz sentido — o "sem garantia" é a ausência de itens; o toggle no cabeçalho da seção vira "Nenhuma garantia" (lista vazia) vs "Adicionar garantias". Botão "＋ Adicionar garantia" permite múltiplas do mesmo tipo (ex.: 2 fiadores).
- Estado local passa a ser `tenants: TenantDraft[]` e `guarantees: GuaranteeDraft[]` em vez das variáveis escalares atuais; `handleSubmit` monta o novo `RentalContractInput`.
- Reset limpa as listas para `[emptyTenant()]` e `[]`.

## Detalhes / listagem

- `RentalCard.tsx`: continuar mostrando o locatário principal, adicionar sufixo "+N" quando `tenants.length > 1`.
- `RentalExpandedDetails.tsx`: renderizar todos os locatários e todas as garantias (uma linha por item, com tipo e dados relevantes). Ações (encerrar/renovar/pagar/excluir) inalteradas.
- Filtros/busca (`useRentals.ts`): incluir nomes de todos os tenants no `hay` para o search.
- KPIs: nada muda (baseados no contrato).
- Documentos do contrato: inalterados.

## Migração de UI sem breaking changes

Os campos legados (`tenant`, `guarantor`, `garantiaTipo`) permanecem populados a partir do item primário, então consumidores fora do menu Aluguéis (se houver) continuam funcionando enquanto migramos.

## Ordem de execução

1. Migration (tabelas + GRANT + RLS + trigger + backfill).
2. Atualizar `src/types/rental.ts`.
3. Atualizar `src/lib/rentals/rentals.functions.ts` (list/create/update).
4. Reescrever seções do `RentalFormModal.tsx`.
5. Ajustar `RentalCard.tsx`, `RentalExpandedDetails.tsx` e busca em `useRentals.ts`.
6. Verificar build/typecheck.
