# Validação e entrega — Meta Ads / Lead Ads

Execução em 26/10/2026 no projeto existente Gestão Cordial. A [operação e matriz de credenciais](operacao.md) complementa este registro.

## Implementação

- `src/lib/ads`: referências seguras de secrets, modo `system_user`, OAuth protegido e isolado por marca, diagnóstico por capacidade, provider Graph centralizado, descoberta de contas/campanhas, sincronização persistida e ingestão de leads.
- `src/lib/marketing`: leitura paginada e DTOs com proteção financeira no servidor. O Bot mantém seu escopo próprio de proprietário e imobiliária; o MCP reutiliza esse contrato.
- Rotas TanStack Start: `/api/public/meta/leadgen`, `/api/public/hooks/meta-leads` e `/api/public/hooks/ads-sync`; callback OAuth preservado para Meta/Google.
- Marketing: hierarquia de indicadores, filtros/conta/período, campanhas e caixa de leads. Integrações: configuração administrativa, referências sem valores privados, diagnóstico e mapeamento de formulários. Campanhas manuais e Google permanecem no módulo existente.
- `tests/marketing`: prévia isolada dos componentes reais com transportes sintéticos e sessão de demonstração. Nenhuma fixture é carregada pelo produto em produção.

## Banco e garantias

Nova migração **0039_meta_ads_leadgen**, snapshot e entrada no journal Drizzle. Migrações antigas não foram alteradas. Aplicação no banco ativo **pendente**.

| Entidade                  | Alteração e proteção                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ad_platform_connections` | Modo de credencial, referências/cifra, ativos e capacidades sanitizadas; sem gravação nova de token em texto puro; acesso direto de `anon/authenticated` revogado                                                           |
| `ad_accounts`             | Conta vinculada à conexão, moeda e fuso; acesso por handlers autorizados                                                                                                                                                    |
| `marketing_campaigns`     | Conexão/conta e identidade externa estável por plataforma, conta, marca e campanha; vínculo validado por trigger                                                                                                            |
| `marketing_daily_metrics` | Valores decimais, origem de sincronização, agregado de período e ações auditáveis; acesso financeiro protegido                                                                                                              |
| `ad_sync_jobs`            | Enqueue/claim/commit/fail, lease, tentativas, retomada e estados parciais; trabalho concorrente deduplicado por campanha e no máximo um job em execução por conta                                                           |
| `ad_oauth_states`         | Estado de uso único, expiração, vínculo ao usuário; somente serviço                                                                                                                                                         |
| `meta_lead_form_mappings` | Campos e regras explícitas de marca, finalidade, imóvel e corretor; aplicativo derivado da conexão e identidade única de formulário ativo por aplicativo/Página/formulário; mudança dos ativos invalida mapeamentos antigos |
| `meta_lead_submissions`   | Fila durável e caixa de entrada; unicidade aplicativo/Página/leadgen; lease, erro sanitizado, vínculo CRM e limpeza de dados pessoais pelos fluxos de exclusão existentes                                                   |

RPCs públicas autenticadas: `ad_connections_public()` (metadados administrativos explícitos) e `marketing_campaigns_safe(...)` (projeção, autorização de módulo/marca e mascaramento financeiro). `marketing_can_operate(...)` verifica o ator autenticado. Tabelas brutas de campanhas/métricas/contas/jobs não ficam disponíveis para contornar a projeção financeira.

RPCs de mutação/fila, incluindo `ad_oauth_consume`, `ad_sync_enqueue/claim/commit/fail`, `meta_lead_ingest/claim/complete/retry/assign/resolve` e dispatchers, têm execução restrita a `service_role`, `search_path` fixado e autorização de domínio nos handlers. O cliente não escolhe o ator para conceder acesso. `marketing_summary_for_period` também é interna.

O ACK do webhook só ocorre depois da persistência. O processamento não continua em uma Promise solta após a resposta. A conclusão de CRM e o vínculo à submissão são transacionais; repetição e lease antigo não criam outro atendimento. Um contato repetido com nova intenção ou associação ambígua passa por revisão, sem sobrescrever corretor ou histórico. Notificações existentes são reaproveitadas; não foi adicionado envio de WhatsApp ou e-mail ao lead.

Crons `meta-ads-leadgen` e `meta-ads-sync` são preparados **inativos**. Dispatch usa origem HTTPS administrativa e `public.internal_worker_headers()`. Nada foi ativado no ambiente real.

## Verificação automatizada

Comandos executados com os binários locais do projeto e o Node do runtime do Codex:

```sh
vitest run --config vitest.marketing.config.ts
tsx --test tests/ads/*.test.ts src/lib/agent/tools/tools.test.ts src/lib/access-control.test.ts src/lib/attendances/duplicate-detection.test.ts src/lib/attendances/broker-scope.test.ts
tsc --noEmit
vite build
```

Resultado da rodada final: **59 testes Vitest + 69 testes Node (128 no total) passaram**, typecheck e build passaram. A configuração explícita inclui os arquivos `*.vitest.ts`; eles não foram presumidos cobertos pelo script genérico `test`. A CI possui etapa dedicada `bun run test:marketing`.

Cobertura significativa: ausência/rotação/revogação de credenciais; permissões e isolamento; assinatura sobre bytes originais e challenge exato; envelopes com múltiplos eventos; falha de persistência sem ACK; deduplicação, claim, lease e fencing; commit/rollback de CRM; contato ambíguo/nova intenção/campos ausentes; corretor/imóvel de outra marca; notificação idempotente e exclusão de PII, inclusive após conversão posterior do atendimento em cliente; paginação além de dez páginas, falha intermediária, 429/timeout; métricas ponderadas, alcance não aditivo, aliases, moeda/fuso e indisponível versus zero; contratos do Bot/MCP; URLs antigas redigidas na RPC.

O teste de banco executa o SQL real 0039 pelo migrador Drizzle sobre uma base PostgreSQL PGlite representativa de 0038, incluindo grants/roles de aplicação e triggers relevantes. Confirma uma aplicação e segunda execução sem reaplicar. Não substitui migração/teste no Supabase ativo, o scheduler `pg_cron`, concorrência de múltiplas conexões Postgres reais ou entrega de webhook pela Meta.

Lint de todos os arquivos TypeScript/TSX alterados foi executado. Os arquivos de implementação e novos testes passaram. Foram reproduzidos no HEAD anterior os mesmos problemas preexistentes em dois arquivos: **10.262 erros de formatação** no arquivo gerado `src/integrations/supabase/types.ts` e **11 `no-explicit-any`** em `src/lib/agent/tools/tools.test.ts`. Não foi feita reformatação massiva desses arquivos; os trechos novos de tipos estão formatados. Não houve nova falha nesses arquivos na rodada final.

`git diff --check` passou. A busca no bundle público por implementações de resolução/descriptografia, `debug_token`, cifra e chave `service_role` não encontrou os módulos privados. Nenhum valor de secret foi usado nessa inspeção.

## Evidências visuais

A skill Product Design foi usada para inspecionar primeiro as telas existentes e avaliar a evolução. A prévia antiga estava inicialmente bloqueada por login. Após o usuário entrar, Marketing e Integrações foram acessados: Marketing vazio e conectores não configurados; Integrações sem o novo card Meta. Capturas autenticadas foram mantidas fora do Git por conterem contexto administrativo. A nova branch ainda não está nesse runtime.

As imagens abaixo usam **dados sintéticos identificados por um aviso visível**, renderizados pelos componentes reais da branch em `preview:marketing`. Elas comprovam a UI, não uma conexão com a Meta.

| Estado                                                 | Larguras CSS capturadas                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visão geral                                            | [360](evidence/overview-360.png), [390](evidence/overview-390.png), [768](evidence/overview-768.png), [1440](evidence/overview-1440.png)                                                 |
| Leads Meta                                             | [360](evidence/leads-360.png), [390](evidence/leads-390.png), [768](evidence/leads-768.png), [1440](evidence/leads-1440.png)                                                             |
| Integrações com capacidades parciais                   | [360](evidence/integrations-partial-360.png), [390](evidence/integrations-partial-390.png), [768](evidence/integrations-partial-768.png), [1440](evidence/integrations-partial-1440.png) |
| Configuração segura administrativa                     | [390](evidence/integrations-configuration-390.png)                                                                                                                                       |
| Secretária sem dados financeiros/ações administrativas | [390](evidence/overview-secretaria-390.png)                                                                                                                                              |
| Campanha manual operacional                            | [Formulário](evidence/manual-secretaria-390.png), [rodapé por teclado](evidence/manual-footer-secretaria-390.png)                                                                        |
| Sem dados e erro localizado                            | [Vazio](evidence/empty-390.png), [Erro](evidence/error-390.png)                                                                                                                          |

Em todos esses recortes, largura do documento igual à largura da viewport, sem overflow horizontal. Medições em [viewports.json](evidence/viewports.json). Foram exercitados filtros, abertura do drawer manual, Escape e retorno do foco ao botão de origem, ações da caixa de leads e atribuição sintética. O estado secretária foi conferido sem valores financeiros e sem botões de configuração. Não foi concluída uma auditoria formal com leitor de tela ou teste com aparelhos físicos.

## Estado da entrega e ativação

| Parte                             | Estado                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| Código e prévia local             | Implementados e verificados; entrega por PR                        |
| Migração 0039 no Supabase ativo   | Pendente; não aplicada                                             |
| Secrets Meta                      | Pendentes no formulário seguro do Lovable; matriz em `operacao.md` |
| Worker e cron reais               | Código e SQL preparados; não implantados/ativados                  |
| Endpoint público novo             | Não implantado: URL prevista respondeu 404                         |
| Configuração Meta do app e Página | Não comprovada                                                     |
| Leitura de conta/campanhas reais  | Pendente de secrets e ativos validados                             |
| Lead oficial Meta → CRM           | Pendente; nenhum lead real consultado/criado nesta execução        |
| Frontend em produção              | Não publicado                                                      |

A URL prevista é `https://cordialgestao.com/api/public/meta/leadgen`; **não há callback novo comprovadamente ativo**. O conector informou que o deploy suportado reúne frontend e rotas de servidor, portanto não foi publicado apenas para expor o webhook. Como 0039 revoga acessos usados pelo runtime antigo, schema e handlers novos precisam de implantação coordenada. Não aplicar a migração isoladamente na versão antiga.

O único canal seguro para fornecer as credenciais pendentes é o [editor do projeto → Project Settings → Secrets](https://lovable.dev/projects/feb646c9-c19a-4360-8cc9-bec5237532ea). Depois será necessário implantar a versão aprovada, aplicar/verificar o journal, diagnosticar os ativos, ativar workers, confirmar as duas assinaturas Meta e executar o teste oficial. A integração não foi declarada ativa nem pronta para produção.
