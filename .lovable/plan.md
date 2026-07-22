## Objetivo

1. **Vendas** — permitir marcar cada anexo com uma categoria: `Contrato de venda`, `Contrato de corretagem`, `Check-list venda`.
2. **Aluguéis** — permitir marcar cada anexo com uma categoria: `Contrato de aluguel`, `Termo de vistoria`, `Check-list aluguel`.
3. **Aluguéis** — habilitar upload de anexos **direto no modal de cadastro/edição** (`RentalFormModal`), não só na tela expandida após criar. Hoje o modal não tem nenhum campo de anexo — o usuário precisa salvar o contrato, abrir os detalhes e só então anexar.

Nada de mock: tudo persistido em Supabase Storage + tabelas existentes, respeitando RLS.

## Banco (uma migração)

Adicionar coluna `category text` (nullable, com CHECK) em cada tabela de anexos:

- `public.sale_documents.category` — valores permitidos: `contrato_venda`, `contrato_corretagem`, `checklist_venda`, `outro`.
- `public.rental_contract_documents.category` — valores permitidos: `contrato_aluguel`, `termo_vistoria`, `checklist_aluguel`, `outro`.

Default `outro` para não quebrar linhas existentes. Sem alterações de RLS/grants (já corretas).

## Backend (server functions)

- `src/lib/sales/sales.functions.ts` — `addSaleAttachment` passa a aceitar `category`, `mapAttachment` retorna o campo, `SaleAttachment` ganha o campo.
- `src/lib/rentals/rentals.functions.ts` — `registerRentalContractDocument` aceita `category`, `listRentalContractDocuments` retorna; type `RentalContractDocument` ganha o campo.

## Front-end

### Vendas
- `SaleDetailsDrawer.tsx` — no bloco "Anexos adicionais": ao clicar em "+ Adicionar", abrir seletor de categoria (dropdown pequeno) antes/junto do file input, e chip com a categoria em cada item da lista.
- `src/routes/_app.vendas.tsx` — repassar `category` para `addAttachment`.

### Aluguéis (o pedido principal)
- `RentalFormModal.tsx` — nova seção **"Anexos"** com as três categorias fixas:
  - Cada categoria é um bloco (título + descrição curta + botão "Adicionar arquivo" + lista dos arquivos já enviados dessa categoria).
  - Durante **edição** (contrato já existe): upload dispara direto para Storage + `registerRentalContractDocument` com `contractId` + `category`; lista renderiza via `useRentalDocuments`.
  - Durante **criação** (contrato ainda não existe): guardar arquivos em estado local (`pendingAttachments: { file, category }[]`); após `createRentalContract` retornar o `id`, subir cada um em sequência (mesmo fluxo do `useRentalDocuments`) e mostrar toast de progresso. Falhas em anexos individuais não revertem o contrato — só notificam.
- `RentalDocuments.tsx` — passa a agrupar/mostrar chip de categoria (para a tela expandida continuar consistente).
- `useRentalDocuments.ts` — `uploadFile` aceita `(file, category)`.

## Observações

- Bucket `rental-documents` e `sale-documents` já existem, privados; URLs assinadas continuam servindo os arquivos.
- Limite atual de 50 MB por arquivo mantido.
- Categorização é obrigatória no picker (default para a categoria do bloco em aluguéis; dropdown em vendas com default "Contrato de venda").
- Retro-compat: linhas antigas ficam como `outro` e aparecem numa seção "Outros anexos".

## Fora do escopo

- Nenhuma mudança em Agenciamentos, Financeiro, Agenda ou outros módulos.
- Nenhuma mudança no fluxo de contrato principal do formulário de Vendas (`contractFile*` continua igual — apenas os "anexos adicionais" ganham categoria).
