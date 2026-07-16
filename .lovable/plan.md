## Objetivo

Adicionar as categorias de garantia **Seguro fiança** e **Caução** no fluxo de cadastro/edição de aluguéis, junto do já existente **Fiador**, para deixar explícita a modalidade de garantia usada no contrato.

## Situação atual (menu Aluguéis → Novo aluguel)

Hoje o formulário tem:
- Toggle "Incluir fiador" (opcional) → dados do fiador
- Campo "Caução (R$)" solto na seção Contrato

Não há um seletor explícito da modalidade de garantia — o usuário só consegue registrar fiador e/ou um valor em caução, sem indicar que existe "Seguro fiança".

## Mudanças propostas

### 1. Modelo de dados
Adicionar em `rental_contracts` uma coluna `garantia_tipo` (enum: `sem_garantia`, `fiador`, `caucao`, `seguro_fianca`) e, para "Seguro fiança", os campos opcionais:
- `seguro_seguradora` (texto)
- `seguro_apolice` (texto)
- `seguro_valor_mensal` (numérico)

Manter `valor_caucao` e `guarantor_id` como estão (usados quando o tipo escolhido for Caução ou Fiador).

### 2. Formulário "Novo aluguel"
Substituir a seção atual "Fiador" por uma seção **"Garantia"** com um seletor de 4 opções (segmented control):

```text
[ Sem garantia ] [ Fiador ] [ Caução ] [ Seguro fiança ]
```

Comportamento por opção:
- **Sem garantia** — nenhum campo extra.
- **Fiador** — mostra os campos de fiador que já existem (nome, telefone, e-mail, vínculo).
- **Caução** — mostra o campo "Caução (R$)" (movido da seção Contrato para cá).
- **Seguro fiança** — mostra Seguradora, Nº da apólice, Valor mensal do seguro (R$).

Remover o campo "Caução (R$)" da seção Contrato (fica só dentro da opção Caução).

### 3. Detalhes do contrato (drawer)
Na tela de detalhes do aluguel, exibir um bloco "Garantia" com o tipo escolhido e os campos correspondentes (fiador, valor de caução, ou dados do seguro fiança).

### 4. Tipos e serviços
- Atualizar `src/types/rental.ts`: novo tipo `RentalGuaranteeType` e novos campos em `RentalContract` / `RentalContractInput`.
- Atualizar `src/lib/rentals/rentals.functions.ts` para ler/gravar as novas colunas.
- Atualizar `src/integrations/supabase/types.ts` (gerado após a migração).

## Fora de escopo

- Cálculos financeiros a partir do seguro fiança (não vai virar lançamento automático no Financeiro nesta etapa).
- Upload de apólice em PDF.
- Alterações no card resumido de aluguel (`RentalCard`) — só o drawer de detalhes vai exibir a garantia.

## Detalhes técnicos

**Migração SQL** (resumo):
```sql
CREATE TYPE public.rental_guarantee_type AS ENUM
  ('sem_garantia','fiador','caucao','seguro_fianca');

ALTER TABLE public.rental_contracts
  ADD COLUMN garantia_tipo public.rental_guarantee_type NOT NULL DEFAULT 'sem_garantia',
  ADD COLUMN seguro_seguradora text,
  ADD COLUMN seguro_apolice text,
  ADD COLUMN seguro_valor_mensal numeric(12,2);

-- Backfill: contratos com guarantor_id → 'fiador'; com valor_caucao > 0 → 'caucao'
UPDATE public.rental_contracts SET garantia_tipo = 'fiador'
  WHERE guarantor_id IS NOT NULL AND garantia_tipo = 'sem_garantia';
UPDATE public.rental_contracts SET garantia_tipo = 'caucao'
  WHERE valor_caucao IS NOT NULL AND valor_caucao > 0 AND garantia_tipo = 'sem_garantia';
```
RLS existente do `rental_contracts` cobre as novas colunas — sem alterações.

**Arquivos afetados**:
- `supabase/migrations/<novo>.sql` (nova migração)
- `src/types/rental.ts`
- `src/lib/rentals/rentals.functions.ts`
- `src/components/alugueis/RentalFormModal.tsx`
- `src/components/alugueis/RentalExpandedDetails.tsx`
