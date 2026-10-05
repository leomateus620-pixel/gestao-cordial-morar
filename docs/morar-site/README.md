# Site próprio Morar

Implementação em `codex/morar-site-publico`, a partir de `2084471976d8e2f75e08950d8aeab2617fc67ce3`. Não substitui o Gestão nem o site Cordial.

## Acesso após ativação

- Público: `/site-morar`.
- Gestão: **Configurações → Site público Morar → Ver site / Administrar site**.
- Administração autenticada: `/site-morar-administracao`.
- API pública: `/api/morar-site/*`.

Esta PR entrega código e migração. Não aplica banco remoto, faz deploy, troca DNS ou desativa o fornecedor. A URL publicada só oferecerá esta versão depois da ativação do código e do schema.

## Documentos

- [Auditoria e reconciliação](audit.md)
- [Contrato público e isolamento](contract.md)
- [Mídia e cache](media-cache.md)
- [Paridade](parity.md)
- [Direção visual](design.md)
- [Ativação e rollback](activation.md)
- [Validação](validation.md)
- [Verificação HTTP com inventário real em ambiente local](http-validation.md)
- [Autonomia operacional](autonomy.md)

## Execução

Use Bun e o lockfile existente (`bun.lock`), mantendo a versão de Node compatível com Vite 7. Não crie outro catálogo manual.

```sh
bun install --frozen-lockfile
bun run dev
bun run typecheck
bun run test
bun run test:site
bun run lint
bun run build
```

O ambiente existente precisa de `SUPABASE_URL` e da credencial de servidor `SUPABASE_SERVICE_ROLE_KEY`, exclusivamente no runtime privado. O navegador administrativo continua utilizando a chave publicável e a sessão com RLS. Nunca exponha a chave de servidor como `VITE_*`.

Variáveis próprias Morar:

| Variável                       | Uso                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `MORAR_SITE_ENV`               | `preview` por padrão; `production` somente na ativação definitiva                                                |
| `MORAR_SITE_CANONICAL_ORIGIN`  | Origem HTTPS real, sem caminho; não usar origem de preview como domínio definitivo                               |
| `MORAR_SITE_RATE_SECRET`       | Segredo privado para pseudonimizar buckets de limitação                                                          |
| `MORAR_SITE_TRUSTED_IP_HEADER` | Cabeçalho sobrescrito pelo ingress; sem ele o limite é compartilhado                                             |
| `MORAR_SITE_PREVIEW_PASSWORD`  | Proteção Basic opcional da homologação, usuário `morar`                                                          |
| `VITE_MORAR_SITE_PUBLIC_HOST`  | Host exato e opcional para ocupar a raiz em domínio dedicado; requer configuração consistente no build e runtime |

No host do Gestão, mantenha o namespace `/site-morar`. A reescrita de raiz depende de host explícito e não desloca `/imoveis` ou o dashboard. Hosts Cordial e Morar devem ser distintos. Secrets, relatórios restritos e arquivos do inventário não integram esta PR.

## Dados e operação

`properties` e `property_images` permanecem canônicos. `morar_site_*` guarda decisões do canal, referências públicas, aprovação de conteúdo/mídia, configurações, conteúdo editorial, contatos e eventos. O fornecedor anterior é usado apenas pelos scripts de auditoria pontual; nenhuma página pública consulta seu site.

A aprovação do solicitante para os 308 candidatos foi recebida nesta conversa e preparada como lote restrito rastreável, incluindo recibo factual de revisão de mídia. Ela não remove bloqueios, não aprova registros futuros e não autoriza aplicar a migração ou fazer deploy nesta execução.

Contatos e conteúdo institucional são configurados no Gestão. Não foram preenchidos com textos, artigos, depoimentos ou dados fictícios. Há endereços/e-mails contraditórios no site antigo; confirme os dados atuais antes da ativação. O logotipo oficial é preservado em `public/morar-site/logo.jpg`; a fonte Manrope local e sua licença são reaproveitadas.
