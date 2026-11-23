# Seguradoras editáveis pela secretária + contrato gerado anexado automaticamente

## 1. Secretária (Bianca) pode configurar as seguradoras parceiras
- Hoje só o administrador cria/edita seguradoras (tela e regras do banco).
- Passa a valer: **admin e secretária** podem criar, editar cláusula, CNPJ, marcas e ativar/desativar.
- Secretária edita somente seguradoras das marcas a que está vinculada (Cordial, Morar ou ambas); admin edita todas.
- Nada é excluído — desativar continua sendo o caminho.
- Perfis de revisão externa e "só atendimentos" continuam bloqueados.

## 2. Contrato gerado fica anexado ao aluguel automaticamente
- Ao clicar em "Baixar Word" no diálogo "Gerar contrato", o sistema:
  1. gera o arquivo;
  2. salva em **Documentos do contrato** daquele aluguel, na categoria "Contrato" com nome tipo `Contrato gerado - <marca> - <garantia> - <data>.docx`;
  3. faz o download normalmente.
- Continua bloqueado enquanto houver pendências (campos `[PREENCHER]`).
- Gerar de novo cria uma nova versão anexada; nenhuma anterior é apagada ou substituída.
- O anexo gerado aparece marcado como "gerado pelo sistema (não assinado)", para não ser confundido com o contrato assinado. A conferência que libera a vistoria continua exigindo o assinado marcado como conferido.
- Lista de documentos atualiza na hora, sem recarregar.

## 3. Ajuste pendente
- Marcar/desmarcar "conferido" atualiza o botão da vistoria de entrada sem recarregar a página.

## Testes
- Regra de permissão: secretária da marca edita; secretária de outra marca e corretor não.
- Contrato gerado: salvo no contrato certo, nova versão não apaga a anterior, bloqueado com pendências.
- Teste na tela com o contrato da Amanda Luísa; o anexo de teste é removido ao final.
- Não publicar.

## Detalhes técnicos
- Migração aditiva: substituir políticas INSERT/UPDATE de `rental_insurers` por `has_role admin OR (has_role secretaria AND marca em user_agencies)`; coluna opcional `rental_contract_documents.generated_by_system boolean default false`.
- Nova server function `attachGeneratedContract` (requireSupabaseAuth) reaproveitando a lógica de `uploadRentalContractDocument` (bucket, caminho `<contrato>/...`, rollback do arquivo se o registro falhar).
- `RentalInsurersSettings canEdit={isAdmin || isSecretaria}`; invalidar queries de documentos e da vistoria de entrada após salvar/conferir.
