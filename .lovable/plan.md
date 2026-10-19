# Incidente 1409/3408: códigos únicos, envio sem loop, finalidade, Drive por imóvel e fila

Escopo: apenas código e migrações aditivas. Sem alteração de dados, sem publicação, sem tocar em NFS-e, regras de endereço, fotos ou outros imóveis.

## Pontos confirmados no código
- `src/lib/imoveis/registration.functions.ts:118` confirma reservas com `.in("status", ["reserved","committed"])`, sem conferir o imóvel.
- `src/lib/imoveis/drive/property-drive.server.ts:438-441`: sem pasta registrada, usa `findChildFolder(folderName, root.id)` (busca por nome) e adota a pasta encontrada; quando o nome difere, renomeia pelo ID (linha 433).
- `MAX_UPLOADS_PER_RUN = 6` (linha 554); a fila usa `property_drive_claim_jobs` com lease de 240 s.
- `src/lib/agenciamentos/property-link.functions.ts:196` só valida se a finalidade é `venda`/`aluguel`.
- `src/lib/imobibrasil/sync.server.ts` agenda `status: "retry"` em vários caminhos de erro (linhas ~1897, 1941, 1954, 1994).
- Ainda a confirmar no banco, antes de criar migrações: definição atual de `property_drive_claim_jobs`, do gatilho `properties_drive_rename_on_codes`, dos índices de `properties` e de `property_drive_folders`, e o caminho exato que transforma o erro `ppp_provider_external_id_idx` em "Recuperação automática agendada".

## Ordem de execução
1. **Consultas somente leitura** (SELECT): duplicatas de `codigo_cordial` e `codigo_morar` (normalizados, sem nulos/vazios), duplicatas de `property_drive_folders.property_folder_id`, definição das funções e gatilhos citados. Se houver duplicatas, eu listo os IDs e paro a parte do índice correspondente. A duplicata atual Casa/AP na pasta do Drive fica para correção manual.
2. **Códigos únicos**
   - Confirmação de reserva: só confirma reservas `reserved` com o mesmo `property_id`, ou com `property_id` vazio e `reserved_by` igual ao usuário. Uma reserva `committed` só é aceita se já pertencer ao mesmo imóvel (para salvar de novo sem erro). Reserva de outro imóvel gera o erro "Código X já pertence ao imóvel Y". A conferência fica no servidor, e a contagem de linhas atualizadas precisa bater com o pedido.
   - Código digitado à mão: no salvamento (`finalizePropertyRegistration` / `registration.server.ts`), recusa um código já usado em outro imóvel ou com reserva ativa/confirmada de outro imóvel. A regra fica em `registration-rules.ts`, sem acesso ao banco.
   - Migração aditiva: índices únicos parciais em `lower(trim(codigo_cordial))` e `lower(trim(codigo_morar))` onde o valor não é nulo nem vazio, criados só se o passo 1 estiver limpo.
3. **Envio Imobi sem loop**
   - Erro de unicidade (23505 / `duplicate key` / conflito de referência) passa a ser terminal. O job vira `failed`, sem novo retry, e a publicação vira o novo estado `conflict` (migração aditiva no CHECK/enum, se existir), com a mensagem "código já usado pelo imóvel X".
   - A recuperação automática respeita `max_attempts` e o backoff, e não recria job para publicação em `conflict` nem para job terminal.
   - O alerta aparece no painel do imóvel e em `ProviderOpsPanel` (admin). A sincronização global não é pausada.
4. **Finalidade coerente**
   - No servidor (`property-link.functions.ts`), a finalidade precisa combinar com a `operacao` do imóvel (venda→venda, aluguel→aluguel; venda e aluguel aceitam as duas). Fora disso, bloqueia, salvo com confirmação explícita (`confirmIncoherentPurpose: true`), que fica registrada.
   - No `PropertyAgencyStep`, ao trocar a operação, a finalidade "tocada" que ficou incoerente é realinhada, com aviso.
   - Quando a operação muda no salvamento, o agenciamento automático (`property:<id>:initial-agency-listing`) é reconciliado sem sobrescrever uma escolha confirmada.
5. **Drive por ID do imóvel**
   - Uma pasta criada recebe `appProperties.cordialPropertyId = <id>`.
   - Ao adotar uma pasta encontrada pelo nome: recusa se o ID já estiver em `property_drive_folders` para outro imóvel, ou se o `appProperties` apontar para outro imóvel. Nesses casos, cria uma pasta nova. A pasta sem marca só é adotada se não estiver registrada, e então é marcada.
   - Migração aditiva: índice único parcial em `property_drive_folders.property_folder_id` (só se o passo 1 estiver limpo; senão, listar e parar).
   - O gatilho `properties_drive_rename_on_codes` e o renomear do worker não renomeiam uma pasta registrada em outro imóvel nem marcada para outro.
6. **Fila do Drive**
   - `property_drive_claim_jobs` (nova versão aditiva, mesma assinatura) também pega jobs `processing` com lease vencido. Isso soma uma tentativa e respeita `max_attempts`; ao passar do limite, o job vira `failed`.
   - No reclaim, arquivos `uploading` do job morto voltam para `pending` (o envio recomeça; retomar a sessão em partes fica fora, pela simplicidade e segurança).
   - `enqueueDriveJob` não considera ativo um job com lease vencido.
   - O worker processa horizontais → verticais → vídeos, e o encadeamento continua enquanto restar arquivo, vídeo incluído. Os contadores da tela (`usePropertyDrive`) passam a ser calculados direto de `property_drive_files` por categoria/estado.
7. **Testes** (ao lado dos existentes; banco isolado para SQL)
   - Confirmar reserva de outro imóvel → falha. Código manual duplicado → falha.
   - Duplicate key → estado terminal, sem retry; recuperação automática não recria.
   - Finalidade incoerente → bloqueio / aceita com confirmação.
   - Pasta com o mesmo nome registrada em outro imóvel → cria nova; gatilho não renomeia pasta compartilhada.
   - Lease vencido → reclaim e soma de tentativa; `uploading` → `pending`; `max_attempts` respeitado.
   - Fila com mais de 6 arquivos, incluindo vídeos → termina tudo; contadores batem.
   - Regressão: regras de endereço, códigos 1406/3405 e 1385, fotos (ordem e "envia antes de apagar").
   - Rodar `bun run test:site`, os testes de imóveis/imobibrasil, typecheck e build.

## Arquivos afetados
- `src/lib/imoveis/registration.functions.ts`, `registration.server.ts`, `registration-rules.ts` (+ teste), `codes.functions.ts` (`commitPropertyCodes`, com a mesma restrição)
- `src/lib/imobibrasil/sync.server.ts`, `queue-policy.ts` (+ teste), `create-failure.ts` (+ teste), `src/components/integracoes/ProviderOpsPanel.tsx`, painel do imóvel
- `src/lib/agenciamentos/property-link.functions.ts`, `src/components/imoveis/PropertyAgencyStep.tsx`
- `src/lib/imoveis/drive/property-drive.server.ts`, `naming.ts` (+ teste), `src/hooks/usePropertyDrive.ts`
- Migrações Drizzle aditivas (novas entradas no journal): índices únicos de códigos; estado `conflict`; índice único de pasta; nova versão de `property_drive_claim_jobs` e do gatilho de renomear.
- `AGENTS.md`: uma regra para "pasta do Drive adotada só por ID/appProperties" e outra para "unicidade = erro terminal".

## Riscos
- Índices únicos falham se existir duplicata: mitigado pela consulta prévia e pela parada.
- Um novo estado `conflict` pode não ser reconhecido por telas ou filtros existentes: vou revisar todos os usos de status de publicação.
- No reclaim, o mesmo arquivo pode ser reenviado (duplicado no Drive) se o envio anterior terminou sem registrar. Mitigação: antes de reenviar, procurar por nome + `appProperties` na pasta.
- Uma finalidade que passa a bloquear pode travar cadastros antigos incoerentes: o bloqueio vale só ao salvar o agenciamento, com a opção de confirmar.
- Nada é publicado: as correções só chegam ao site oficial depois da sua autorização para publicar.
