# Códigos Cordial/Morar únicos — bloqueio no servidor, no banco e no envio

## Objetivo
Dois imóveis nunca podem ficar com o mesmo código Cordial ou Morar. O caso 1405/3404 de hoje não pode se repetir, e se um código repetido escapar, o envio para com uma mensagem clara, sem entrar em repetição.

## 1) Bloqueio ao salvar (criar, editar, concluir)
- Nova função de servidor `assertProviderCodesFree(admin, { propertyId, codigoCordial, codigoMorar })` em `src/lib/imoveis/code-guard.server.ts`. Ela compara sem diferenciar maiúsculas e minúsculas e ignora espaços nas pontas. A busca considera só imóveis não arquivados (`archived_at is null`) e exclui o próprio imóvel.
- Se o código estiver ocupado, ela recusa com a mensagem: "O código Cordial 1405 já é usado pelo imóvel <código do outro site / tipo, bairro> (id curto). Escolha outro código."
- A função é chamada em `createImovelCore` e `updateImovelCore` (`imoveis.functions.ts`). Por consequência, `finalizePropertyRegistration` também fica coberta. Na edição, ela só roda quando o código muda.
- Código digitado à mão (sem reserva): depois da conferência, o sistema grava em `provider_code_reservations` uma linha `committed` para esse provedor e código, ligada ao imóvel. Se outro imóvel já tiver uma reserva ativa ou confirmada desse código, a gravação falha com a mesma mensagem. Isso acontece dentro da mesma chamada de salvar, antes de confirmar.

## 2) `commitPropertyCodes` e o passo de códigos do `finalize`
- Cada reserva só é confirmada se as três condições forem verdadeiras:
  - foi feita pelo próprio usuário (`reserved_by = userId`);
  - o código dela é igual ao código que está sendo gravado no imóvel para aquele provedor;
  - o código não é usado por outro imóvel.
- Uma reserva vencida (`expires_at` passado) pode ser confirmada se cumprir as três condições. Se alguma falhar, a reserva não é confirmada: vira `released`, ou `taken_remote` quando o código for de outro imóvel.
- Quando a reserva é recusada, o sistema reserva um código novo (`reserve_provider_code` com conferência no site) e grava esse código no imóvel. A resposta avisa o usuário: "O código 1405 já estava em uso; o imóvel recebeu 1406."
- A lógica fica num único lugar, `reconcileReservations` em `code-guard.server.ts`, usado pelas duas funções. Isso evita a cópia atual do passo 2 dentro de `registration.functions.ts`.

## 3) Banco: índice único parcial
- Primeiro, uma consulta só de leitura (SELECT) procura códigos duplicados entre imóveis não arquivados, separadamente para Cordial e Morar:
  `select lower(trim(codigo_cordial)), array_agg(id) from properties where codigo_cordial is not null and trim(codigo_cordial) <> '' and archived_at is null group by 1 having count(*) > 1` (e o mesmo para Morar).
- **Com zero duplicados:** uma migração cria os índices únicos parciais `properties_codigo_cordial_unique_active` e `properties_codigo_morar_unique_active` sobre `lower(trim(codigo))`, com `where codigo is not null and trim(codigo) <> '' and archived_at is null`. A migração não apaga nem altera nada.
- **Se aparecer algum duplicado:** a migração não roda. Eu mostro a lista com os ids e espero você decidir.
- O erro de chave duplicada (23505 nesses índices) é traduzido para a mesma mensagem clara do item 1. Isso cobre o caso de dois salvamentos ao mesmo tempo.
- Ponto a observar: reativar um imóvel arquivado (`property_unarchive`) passa a falhar se o código dele estiver em uso. Esse é o comportamento desejado, e a mensagem será clara.

## 4) Envio (worker de sincronização)
- Em `sync.server.ts`, nos pontos em que a consulta por referência encontra um único anúncio (`lookup.kind === "unique"`, ~linhas 855, 1075, 1444 e 1657):
  - Antes de gravar `external_property_id`, o worker confere se outra publicação do mesmo provedor já está ligada a esse id remoto e pertence a **outro** imóvel.
  - Se estiver: a publicação fica com `status = error`, `last_error_category = business` e a mensagem "Código duplicado com o imóvel X (anúncio Y). Envio bloqueado; nenhum anúncio foi alterado." O worker não grava o id, não faz nenhuma chamada de alteração ao site, libera a trava de criação e lança erro de negócio, que não volta para a fila.
- A conferência fica num ajudante puro e testável, `classifyRemoteOwnership`. A consulta por referência, `awaiting_create_reconcile`, as 3 conferências e a classificação do HTTP 400 continuam como estão.

## 5) Formulário (PropertyForm)
- Quando o código é digitado à mão, o sistema confere em tempo real, com espera de 400 ms, usando a nova função de servidor só de leitura `checkProviderCodeAvailability({ provider, code, propertyId })`. Ela devolve livre, ou ocupado com o nome e o link do outro imóvel.
- Se o código estiver ocupado, aparece o aviso em vermelho "Já usado por …" e o botão de salvar/avançar fica bloqueado. O servidor continua sendo a garantia final.
- Uma reserva que falhou não mantém mais um número digitado como se estivesse reservado: o status passa a "manual", e esse código passa pela mesma conferência.

## 6) Testes (node:test)
- `code-guard.test.ts`:
  - código livre, código ocupado por outro imóvel, código do próprio imóvel, imóvel arquivado ignorado;
  - maiúsculas/minúsculas e espaços;
  - reserva de outro usuário, reserva com código diferente, reserva vencida mas válida, reserva com código já em uso que recebe um código novo;
  - código manual gerando a linha confirmada.
- `remote-ownership.test.ts`: id remoto livre, id ligado ao mesmo imóvel (segue), id ligado a outro imóvel (bloqueia, sem alteração remota).
- Tradução do erro 23505 para a mensagem clara.
- Teste da lógica do aviso "já usado por…" no formulário.
- Rodar a suíte completa e o typecheck.

## Arquivos
- novos: `src/lib/imoveis/code-guard.server.ts`, `code-guard.ts` (regras puras), `code-guard.test.ts`, `src/lib/imobibrasil/remote-ownership.ts` + teste
- alterados: `imoveis.functions.ts`, `codes.functions.ts`, `registration.functions.ts`, `sync.server.ts`, `PropertyForm.tsx`, `ProviderCodeFields.tsx`, `usePropertyCode.ts`
- migração: só os 2 índices únicos parciais, e só depois da consulta sem duplicados

## Restrições confirmadas
- Nada é publicado e nenhum envio é enfileirado.
- NFS-e e fiscal de aluguel não são tocados.
- A sincronização Imobi não é pausada.
- Nenhuma alteração de dados: nenhum UPDATE ou DELETE manual. A migração só cria índices, e só com zero duplicados.
- Os imóveis aed8a310 (1406/3405) e 8c6a2cdc ficam como estão.
