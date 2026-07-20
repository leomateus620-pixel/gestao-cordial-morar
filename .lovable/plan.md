## Tarefa 1 — Finalidade "Vender" e "Alugar" no cadastro de Clientes

Hoje `ClientPurpose` só suporta `compra | aluguel | ambos` (ótica do comprador/locatário). Vou estender para cobrir proprietários que estão colocando o imóvel no mercado.

- `src/types/client.ts`: estender `ClientPurpose` com `"venda"` e `"locacao"`; adicionar as opções em `clientPurposeOptions` ("Vender (proprietário)", "Alugar (proprietário)"); atualizar `clientPurposeLabel`.
- `src/components/clients/ClientFormModal.tsx`: rótulo do orçamento vira "Valor pretendido" quando `venda`/`locacao`; validação continua opcional.
- `src/hooks/useClients.ts`: filtro `purpose` já é `"todos" | ClientPurpose` — passa a aceitar os dois novos valores automaticamente; incluir `locacao` na contagem de "aluguel" e `venda` na de "compra" nos stats para não zerar os cards.
- `src/services/clients.ts`: se houver derivações por purpose, ajustar da mesma forma.
- Coluna `purpose` no banco já é `text` livre — nenhuma migração necessária.

## Tarefa 2 — Código/Nome do imóvel no cadastro de Atendimentos

No passo "Interesse", ao lado do select "Vincular imóvel existente", adicionar um campo de texto livre para o corretor digitar o código do site ou o nome do residencial quando o imóvel não está cadastrado no sistema.

- Migration: `ALTER TABLE public.attendances ADD COLUMN imovel_codigo text` (sem alterar RLS/policies).
- `src/types/atendimento.ts`: novo campo opcional `imovelCodigo?: string`.
- `src/lib/attendances/attendances.functions.ts`: mapear `imovel_codigo` ↔ `imovelCodigo` em list/create/update.
- `src/components/atendimentos/AtendimentoFormModal.tsx`: novo `Field label="Código do imóvel ou nome do residencial"` acima do select "Vincular imóvel existente"; persistir no estado do form.
- `src/components/atendimentos/AtendimentoCard.tsx` / detail: exibir o código quando presente (chip discreto) para o corretor identificar rapidamente.

## Tarefa 3 — Dados do Proprietário no cadastro de Aluguéis

Adicionar bloco "Proprietário do imóvel" no `RentalFormModal`, dentro da seção do imóvel (aplica ao cadastro E à edição). Como o proprietário é atributo do imóvel, armazenar em `rental_properties`.

- Migration: `ALTER TABLE public.rental_properties ADD COLUMN proprietario_nome text, ADD COLUMN proprietario_cpf text, ADD COLUMN proprietario_email text` (RLS existente cobre; sem novos GRANTs).
- `src/types/rental.ts`: adicionar `proprietarioNome`, `proprietarioCpf`, `proprietarioEmail` (opcionais) em `RentalProperty` e `RentalPropertyInput`.
- `src/lib/rentals/rentals.functions.ts`: mapear as três colunas em list/create/update do imóvel; incluir no fetch usado pelo contrato.
- `src/components/alugueis/RentalFormModal.tsx`: nova sub-seção "Proprietário" com Nome completo (obrigatório se novo imóvel), CPF/CNPJ (máscara já usada nos locatários) e E-mail (validação básica).
- `src/components/alugueis/RentalExpandedDetails.tsx`: exibir o proprietário no card expandido (nome + contato mascarado).

## Testes e validação

- Migrations aplicadas → typegen atualizado → build passa.
- Fluxo Clientes: criar cliente com finalidade "Vender" e "Alugar", conferir listagem, filtros e edição.
- Fluxo Atendimentos: cadastrar com código do imóvel preenchido, editar, e conferir exibição no card.
- Fluxo Aluguéis: criar novo contrato com proprietário, editar contrato existente adicionando proprietário, conferir persistência e visualização.
