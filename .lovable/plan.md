# Meta Ads: resultado da inspeção (só leitura)

Nenhum arquivo do app, nenhum dado e nenhuma migração foram alterados. Nada foi publicado.

## Chaves (só se existem ou não, nenhum valor mostrado)
| Chave | Existe |
|---|---|
| META_APP_ID | não |
| META_APP_SECRET | não |
| META_ACCESS_TOKEN | não |
| META_PAGE_ID | não |
| META_AD_ACCOUNT_ID | não |
| META_WEBHOOK_VERIFY_TOKEN | não |
| META_GRAPH_API_VERSION | não |
| WORKER_HOOK_SECRET | sim |
| ADS_CREDENTIAL_ENCRYPTION_KEY | não |

## Endereço público e publicação
- Endereço principal com HTTPS fixo: https://cordialgestao.com (também www.cordialgestao.com e gestao-cordial-morar.lovable.app).
- Endereço de retorno do login do Meta que o código atual usa: https://cordialgestao.com/api/public/ads-oauth/callback
- A publicação não separa as rotas públicas do resto do app. As duas partes entram no ar juntas quando você clica em Publicar. Antes disso, a prévia já roda o código novo.

## Migrações
- O banco ativo segue só o histórico do Drizzle (`drizzle/migrations`, última entrada 0038). Arquivos fora desse histórico nunca chegam ao banco.
- Para aplicar, o caminho é a ferramenta de migração deste ambiente, uma entrada por vez e sem repetir as já aplicadas.

## Formulário seguro
- Não consigo abrir o formulário seguro de chaves neste modo de planejamento.
- Para cadastrar agora: no editor, abra Project Settings → Secrets e adicione cada chave que falta com o nome exato da tabela.
- Se aprovar este plano, saio do modo de planejamento e peço as chaves pelo formulário seguro, sem editar código.

## Observação
- O código atual lê só META_APP_ID e META_APP_SECRET, em `src/lib/ads/oauth.server.ts`, e fixa a versão v21.0 do Graph. As outras chaves só serão usadas se o código da sua PR as ler.
