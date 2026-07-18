## Objetivo
Adicionar edição real dos cadastros de clientes, com persistência no banco e sincronização automática da lista/detalhe. O backend (`updateClient` em `src/lib/clients/clients.functions.ts`) e o hook (`updateClient` em `src/hooks/useClients.ts`) já existem e funcionam — falta apenas a interface de edição, que hoje não existe em nenhum lugar.

## O que será feito

### 1. Reaproveitar o modal de cadastro para modo "editar"
Refatorar `src/components/clients/ClientFormModal.tsx` para aceitar dois modos, sem duplicar o formulário (mesmos 4 passos, validações e responsividade):

- Nova prop opcional `initialClient?: Client` (quando presente → modo edição).
- `initialForm` deixa de ser constante e passa a ser derivado do `initialClient` (ou o padrão atual, para criação).
- Título do modal muda para "Editar cliente" e o botão final para "Salvar alterações" quando em modo edição.
- `onSubmit` continua recebendo `ClientCreateInput` — o chamador decide se cria ou atualiza.

### 2. Botão "Editar" nos cards da lista
Em `src/components/clients/ClientCard.tsx`:
- Adicionar um botão discreto de editar (ícone lápis, canto superior direito ao lado do badge de status) que dispara `onEdit(client)` — nova prop opcional.
- Manter o resto do card idêntico (design, layout, badges).

### 3. Página de detalhe com ação "Editar cliente"
Em `src/routes/_app.clientes.$clienteId.tsx`:
- Botão "Editar cliente" ao lado do "Voltar", que abre o mesmo modal já pré-preenchido.
- Após salvar, os dados atualizados aparecem automaticamente (invalidação do `CLIENTS_QUERY_KEY` já feita pelo hook).

### 4. Orquestração na rota da lista
Em `src/routes/_app.clientes.tsx`:
- Adicionar estado `editing: Client | null`.
- Passar `onEdit={setEditing}` para o `ClientList`/`ClientCard`.
- Renderizar `<ClientFormModal>` com `initialClient={editing}` quando `editing` estiver definido, chamando `updateClient({ id, patch })` do hook `useClients` no `onSubmit`.
- Toast de sucesso: "Cadastro de {nome} atualizado."

### 5. Persistência e permissões
- O `updateClient` do server function já grava no Supabase e o hook faz `invalidateQueries` → a lista e o detalhe se atualizam sozinhos.
- RLS atual da tabela `clients`: apenas o **criador do cadastro** ou **admin** pode editar. Corretores/secretária que apenas foram atribuídos a um cliente veem, mas não editam. O botão de editar ficará **oculto** para quem não tem permissão (comparando `created_by` do cliente com o `userId` do session e o role admin), evitando erro de RLS em runtime.

## Detalhes técnicos

- Nenhuma migração de banco necessária — schema, RLS e server function já estão prontos.
- Sem mudanças no design (mesmo modal, mesmo card).
- Trabalho concentrado em 4 arquivos: `ClientFormModal.tsx`, `ClientCard.tsx`, `ClientList.tsx` (repassar a prop `onEdit`), `_app.clientes.tsx`, `_app.clientes.$clienteId.tsx`.

## Fora do escopo (posso incluir se você quiser)
- Permitir que o **corretor atribuído** (não só o criador) também edite o cliente — exigiria uma pequena migração ampliando a policy `clients_update_own_or_admin` para incluir `assigned_broker_id = auth.uid()`. Hoje só criador/admin edita.