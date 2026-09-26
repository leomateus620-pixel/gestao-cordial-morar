# Execução, ativação posterior e autonomia

## Configuração

| Variável                         | Uso                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                   | Backend do Gestão, somente configuração de servidor neste serviço                                           |
| `SUPABASE_SERVICE_ROLE_KEY`      | Leitura restrita pelo código do servidor; nunca `VITE_`, arquivo público ou commit                          |
| `CORDIAL_SITE_RATE_SECRET`       | Valor aleatório próprio para pseudonimizar chaves de limite/duplicidade                                     |
| `CORDIAL_SITE_TRUSTED_IP_HEADER` | Somente cabeçalho que a infraestrutura sobrescreve de forma confiável                                       |
| `CORDIAL_SITE_PREVIEW_PASSWORD`  | Opcional: homologação restrita, usuário Basic Auth `cordial`; use segredo forte e HTTPS                     |
| `CORDIAL_SITE_CANONICAL_ORIGIN`  | Origem HTTPS definitiva, sem caminho; deixar vazia em preview                                               |
| `CORDIAL_SITE_ENV`               | Apenas `production` habilita indexação, junto com origem canônica válida                                    |
| `VITE_CORDIAL_SITE_PUBLIC_HOST`  | Host público definitivo, sem esquema/caminho; build e runtime devem ter o mesmo valor. Vazio mantém `/site` |

Não houve credencial de serviço disponível no ambiente inicial. A conta autenticada fornecida permitiu inventário e leitura de Storage; ela não foi convertida em segredo permanente do site. Configure credenciais pelo gerenciador de segredos da hospedagem. Não cole senhas em código, configuração pública, PR ou documentação.

O projeto existente compila para o alvo Cloudflare do adaptador Lovable/Nitro. O build local passou, mas isso não prova que os bindings de ambiente, CPU/WASM, Storage e cabeçalhos estejam corretos no destino real. Confirmar como o runtime disponibiliza `process.env` e seus segredos antes da ativação. Nenhuma conta/serviço foi contratada.

## Homologação real

1. Criar/restaurar um ambiente Supabase de homologação sob controle da Cordial. Validar backup/restauração e aplicar a cadeia existente de migrações.
2. Revisar `20260926020000_cordial_owned_site.sql`, aplicar primeiro em homologação e conferir grants/RLS com anon, autenticado comum, admin e secretaria. A migração não chama APIs externas, não muda o bucket e não faz backfill de aprovação.
3. Configurar o servidor, limitar acesso da homologação e manter `CORDIAL_SITE_ENV` diferente de `production`. Conferir `no-store` e `X-Robots-Tag: noindex, nofollow` no HTTP, não apenas no DOM.
4. Abrir o Gestão como administrador: Configurações → Site público Cordial → `/site-administracao`. Cadastrar contato, apresentação, serviços, links aprovados e política de privacidade. Publicar páginas/notícias apenas com conteúdo autorizado.
5. Revisar o cadastro e a galeria pelo link para `/imoveis/{id}`. Confirmar vínculo/autorização Cordial, disponibilidade e conteúdo; fotos e áreas têm confirmação própria. Sem confirmação de fotos/áreas, esses campos ficam ocultos.
6. Executar jornadas públicas e de triagem em homologação, incluindo triggers reais de atendimento, falhas, retirada e recuperação. Revisar acessibilidade e desempenho nos navegadores/dispositivos de aceite.
7. Conferir todos os candidatos e pendências do plano restrito antes de afirmar cobertura integral. O plano gera propostas, nunca aprovação automática.

## Auditorias reproduzíveis

Credenciais entram exclusivamente pelo ambiente do processo do operador. Scripts de auditoria usam a conta autenticada e não escrevem em produção:

```sh
node --env-file=.env scripts/cordial-site/inventory.mjs
node scripts/cordial-site/reconcile.mjs
node --env-file=.env scripts/cordial-site/audit-media.mjs
node scripts/cordial-site/plan-activation.mjs
```

Fornecer `SITE_AUDIT_EMAIL` e `SITE_AUDIT_PASSWORD` por mecanismo seguro local. O diretório padrão `.local/cordial-site-audit` contém dados restritos e não deve ser servido, anexado ao PR ou copiado para `public`. Não salvar assinaturas temporárias em páginas/SEO. Guardar relatório com controle de acesso e política de retenção da Cordial.

O plano de simulação determinístico cobre os 855 registros: 481 somente Cordial no fornecedor, 46 compartilhados, 305 somente Morar, 23 sem vínculo habilitado. Há 51 registros com algum bloqueio e 483 candidatos com vínculo Cordial habilitado que ainda exigem revisão. Essas contagens não são o total final autorizado do site novo. Geradas 509 propostas de redirecionamento por identidade confirmada.

Não faltou vínculo canônico para nenhum dos 509 anúncios antigos; por isso não foi criada uma importação automática de cadastros. Havendo ausência em auditoria futura, priorizar exportação oficial, preservar identidade e criar processo separado com aprovação, checksum, idempotência e simulação. Nunca recuperar conteúdo como efeito colateral de abrir uma página.

## URLs e domínio

Em homologação, `/site` é fora de `_app`; `/imoveis`, dashboard e demais rotas do Gestão mantêm seu papel. Em uma ativação futura, o host definido por `VITE_CORDIAL_SITE_PUBLIC_HOST` reescreve as rotas públicas para a raiz somente nesse host. O host do Gestão não é deslocado. API/mídia continuam em `/api/cordial-site/`. No host público, endpoints administrativos e server functions não são destinados ao visitante.

Configurar `CORDIAL_SITE_CANONICAL_ORIGIN` com o domínio escolhido pela Cordial, nunca derivado do preview. A alteração de host exige novo build com a variável pública e runtime correspondente. Validar diretamente home, deep links, assets, APIs e retorno do navegador no host de homologação antes do DNS definitivo.

Mapa restrito em `activation-plan.json`: caminho antigo → propriedade canônica confirmada → UUID público criado na aprovação. Importar relações revisadas em `cordial_site_redirects` de forma idempotente (`old_path` é chave). O gateway produz 308 específico quando o destino está elegível; anúncio retirado retorna 410. Não redireciona todos os imóveis para a home. Rotas de venda/locação e bairros precisam de mapeamento explícito para os filtros corretos, preservando nomes/aliases; revisar os slugs antes do corte.

Sitemap: `/api/cordial-site/sitemap.xml` e, no host público, `/sitemap.xml`. Somente produção configurada responde com sitemap. `/robots.txt` no host público e `/site/robots.txt` na homologação seguem a política de ambiente. Combinações de busca são `noindex`; não são incluídas no sitemap. Páginas de detalhe entregam conteúdo, título e descrição no SSR. Imóvel conhecido retirado tem 410, endereço inexistente 404, falha de serviço 503/estado de erro; não há oferta antiga mantida ativa para SEO.

## Retorno e rollback

Antes do corte: backup de banco, Storage, configurações da hospedagem e mapa de redirects; ensaio de restauração. A aplicação do site não modifica campos comerciais nem integrações. Para retirar um anúncio use a decisão própria de publicação; não altere o estado do fornecedor para controlar este canal.

Rollback operacional preferido: retirar a rota/domínio público na configuração da hospedagem e voltar o release anterior, preservando todas as tabelas novas, auditoria e leads. A rota administrativa antiga permanece funcional. Se necessário, retirar somente as publicações do canal novo com transação revisada e autorizada. Não apague leads/auditoria para desfazer uma versão. O esquema novo é aditivo; remoção física exige exportação/restauração comprovada e autorização específica. As funções/visões/tabelas têm prefixo `cordial_site_` e sequência própria, facilitando reversão sem tocar em `properties`, imagens ou publicações do fornecedor.

## Checklist de autonomia

| Item          | Verificação necessária antes da ativação                                                      |
| ------------- | --------------------------------------------------------------------------------------------- |
| Repositório   | Organização/conta da Cordial, responsáveis, recuperação, branch protection e revisão          |
| Domínio/DNS   | Titularidade, registrador, MFA, renovação e acesso recuperável; não alterados nesta tarefa    |
| Hospedagem    | Conta própria, build reproduzível, ambientes separados, rollback, logs sem dados pessoais     |
| Banco         | Proprietário, região/plano contratado, RLS, migrações versionadas, limites e exportação       |
| Armazenamento | Conta/bucket privados sob controle, exportação de originais/derivados/associações e ordem     |
| Certificados  | Emissão/renovação TLS e monitoramento; responsável definido                                   |
| Backups       | Banco e objetos, retenção escolhida, cópia independente e ensaio de restauração               |
| Contatos      | Persistência própria, triagem, acesso restrito, retenção e exportação autorizada              |
| Permissões    | Admin/secretaria/corretores revisados, MFA e revogação de acessos antigos                     |
| Dependências  | Inventário de versões/licenças, actualizações e build fora do fornecedor antigo               |
| Operação      | Responsáveis por publicação, privacidade, qualidade de conteúdo, disponibilidade e incidentes |

Custos a medir: hospedagem/CPU de SSR e transformação de imagens, requisições/egresso de Storage, banco, backups, domínio e observabilidade. Não foram consultados contratos/faturas nem estimados preços. Supabase, Cloudflare/Nitro e o adaptador de build são dependências explícitas; a Cordial deve controlar suas contas e poder exportar dados e arquivos. O fornecedor antigo não é dependência de runtime do site novo.
