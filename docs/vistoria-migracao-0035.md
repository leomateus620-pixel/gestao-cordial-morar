# Aplicar a migração da PR #34

Esta PR complementar prepara a aplicação de `0035_vistoria_field_upgrade`. Não executa migrações por merge, push ou abertura de PR e não publica o aplicativo. Nenhuma aplicação em banco hospedado foi realizada na preparação.

## Dependência e ordem de entrega

A branch `codex/vistoria-migracao-0035` parte de `codex/vistoria-campo-segura` (PR #34). A PR complementar deve mostrar somente o aplicador, workflow, testes e documentação. Integre a #34 primeiro e depois esta PR; se necessário, altere a base desta PR para `main` após integrar a #34. Os arquivos SQL 0033, 0034 e 0035 e o journal da #34 permanecem byte a byte iguais.

A 0035 restringe a emissão ao servidor novo: o cliente anterior não consegue concluir pela RPC antiga depois da migração. Coordene a aplicação com a publicação do servidor e cliente da #34 em uma janela sem emissões em curso. Se o ambiente publica automaticamente ao integrar código, prepare essa janela e a execução de migração antes de integrar; este workflow não controla o deploy do Lovable. A aplicação em produção continua sendo uma ação manual do operador.

## O que o aplicador confere

1. Lê o **journal Drizzle original** e calcula os mesmos hashes SHA-256 usados pelo migrador oficial instalado. Exige que o journal desta versão termine na 0035.
2. Descobre o único `__drizzle_migrations` existente no banco. Usa esse schema, inclusive se for `public`; não cria um histórico paralelo em `drizzle`, não inicializa banco vazio e não inventa registros de migrações anteriores.
3. Compara **toda a sequência já aplicada** com os arquivos do journal. Histórico vazio, duplicado, com lacunas, hashes diferentes ou mais recente que esta versão interrompe a operação.
4. Permite somente 0033/0034/0035 pendentes. Qualquer pendência até 0032 é recusada para não aplicar alterações de Drive, sites ou NFS-e dentro deste upgrade. Se a 0033 consta como pendente, mas suas tabelas já existem, exige investigação da aplicação parcial.
5. No modo `apply`, usa uma única conexão e um advisory lock de sessão para serializar execuções deste aplicador. Outros aplicadores, inclusive o fluxo do Lovable, precisam permanecer fora dessa janela: um lock cooperativo não impede DDL externo que ignore o mesmo lock.
6. Chama o **migrador oficial Drizzle**, com os arquivos originais e o histórico existente. O lote de pendências é transacional. Não há cópia do SQL, migração 0036 equivalente, `drizzle-kit push` ou escrita direta no ledger.
7. Após o commit, verifica histórico, RLS nas sete tabelas, cinco gatilhos ativos, FKs compostas, existência e privilégios das RPCs e a política de inserção de mídia que exclui `/docs/`. Verificação não cria vistoria nem emite laudo.

Se a 0035 já estiver registrada e íntegra, uma nova execução informa `already-applied-and-verified`, sem reaplicar SQL. Se estiver registrada com objetos/permissões divergentes, a conferência falha: o histórico sozinho não comprova que o schema continua correto.

## Conexão de banco

O único segredo necessário ao aplicador é `LOVABLE_DB_MIGRATION_URL`, já previsto em `drizzle.config.ts`. Deve ser a conexão PostgreSQL do **ambiente correto**, com permissões de DDL compatíveis com o proprietário dos objetos existentes. Uma chave de API Supabase, inclusive `service_role`, não substitui essa URL.

Use conexão direta ou pooler em **modo sessão**, com TLS válido conforme o provedor. Pooler em modo transação não mantém o advisory lock na mesma sessão e não serve para este comando. O aplicador usa `max: 1`, sem prepared statements, com limite de espera de lock de 10 s e de statement de 120 s. A URL e erros brutos do driver não são impressos.

O servidor da aplicação continua precisando de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para emitir o PDF, como documentado na #34. Esses segredos não são acessados pelo aplicador e não entram no frontend.

## Pelo GitHub Actions

1. Depois que os arquivos estiverem em `main`, use um **Environment existente** do repositório e disponibilize nele o secret `LOVABLE_DB_MIGRATION_URL` correspondente ao banco pretendido. Não coloque a URL em arquivos, inputs do workflow, comentários ou na PR.
2. Em **Actions → Vistoria — migração 0035 → Run workflow**, selecione `main`, o ambiente e `mode=check`. Esse modo abre transação somente leitura. Confira as migrações pendentes e seus hashes.
3. Na janela coordenada de atualização, execute o mesmo workflow com `mode=apply` e `confirmation=0035_vistoria_field_upgrade`. O workflow recusa execuções fora de `main` e recusa `apply` com confirmação diferente.
4. Exija resultado `applied-and-verified` ou `already-applied-and-verified`, com as cinco verificações listadas. Finalize a publicação compatível pelo fluxo existente e teste a jornada em ambiente isolado/autenticado, preservando os registros reais.

O workflow é exclusivamente `workflow_dispatch`; CI, merge e push não o disparam. O botão de execução manual depende de o arquivo existir na branch padrão. O workflow não configura environments, não grava secrets e não habilita aprovações por conta própria; respeita as regras do Environment escolhido.

## Pelo terminal do ambiente autorizado

Com as dependências instaladas e `LOVABLE_DB_MIGRATION_URL` disponibilizada pelo gerenciador de segredos da sessão:

```sh
bun run db:vistoria:check
bun run db:vistoria:apply --confirm=0035_vistoria_field_upgrade
bun run db:vistoria:check
```

Há equivalentes `pnpm run db:vistoria:check` e `pnpm run db:vistoria:apply --confirm=0035_vistoria_field_upgrade`. A URL não é argumento do comando. O modo padrão do script é `check`; não existe fallback para aplicar sem confirmação.

## Resultados e falhas

| Resultado                                        | Significado e próxima ação                                                                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`                                          | Histórico válido; mostra somente as pendências da vistoria. Não houve escrita.                                                                                                                     |
| `verified`                                       | Histórico completo e verificações aprovadas em modo somente leitura.                                                                                                                               |
| `applied-and-verified`                           | Drizzle confirmou o lote e a verificação posterior passou.                                                                                                                                         |
| `already-applied-and-verified`                   | O lote já estava aplicado e passou na verificação; nenhum SQL foi reaplicado.                                                                                                                      |
| Histórico/schema divergente                      | Investigue o fluxo existente. Não altere hashes, não acrescente registros artificiais nem rode arquivos SQL avulsos para contornar o bloqueio.                                                     |
| Erro SQL durante o lote                          | O migrador transacional reverte o lote; os testes cobrem falha perto do fim da 0035 sem registrar sucesso. Corrija a causa e confira novamente antes de aplicar.                                   |
| Queda de conexão perto do commit                 | O resultado pode ser desconhecido. Rode `check` para consultar o histórico; não presuma rollback nem repita SQL manualmente.                                                                       |
| Commit confirmado e verificação posterior falhou | O comando informa explicitamente esse estado e termina com falha. A migração está registrada; investigue objetos/permissões e corrija pelo fluxo de migrações, sem apagar histórico ou documentos. |

O aplicador não executa rollback automático de uma migração já confirmada, não remove PDFs e não altera imóveis, vistoria Nº 1, mídias, dados fiscais ou anúncios. A compatibilidade de rollback da aplicação deve considerar a mudança dos privilégios de emissão.

## Validação desta entrega

Os testes usam as migrações reais em PostgreSQL isolado (PGlite), o journal completo, o migrador oficial e históricos de fixture. Cobrem 0035 isolada, sequência 0033–0035, ledger em `public` sem criar outro, modo somente leitura, reaplicação sem alteração, hashes/lacunas, schema parcial, falha transacional, permissões ampliadas e preservação de linhas/documentos.

O driver PGlite de consultas preparadas rejeita arquivos com vários comandos. A fixture encaminha consultas sem parâmetros ao protocolo simples (`exec`), refletindo o comportamento de `postgres-js.unsafe` utilizado em produção, sem separar por ponto e vírgula nem modificar SQL. Não foi realizada conexão com banco hospedado, configurado secret de produção ou acionado o workflow de aplicação.

Referências: [migrações Drizzle](https://orm.drizzle.team/docs/drizzle-kit-migrate), [execução manual no GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [advisory locks do PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).
