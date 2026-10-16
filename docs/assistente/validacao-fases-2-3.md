# Validação — Assistente Cordial, fases 2 e 3

Implementação em uma PR, com o plano registrado antes do código. Nenhum deploy foi realizado.

## Banco conectado

As migrations **0015, 0016, 0017 e 0018** foram aplicadas pelo conector Lovable da conta Cordial no projeto **Gestão Cordial**, em transações com controle de versão e registro dos hashes no histórico Drizzle. A validação do catálogo e das permissões está em [validacao-remota-fases-2-3.json](./validacao-remota-fases-2-3.json).

- RLS habilitada em todas as 13 tabelas do assistente.
- Comandos de negócio executam como `SECURITY INVOKER` com o token do usuário.
- Prova de confirmação e refresh tokens não podem ser lidos pelo navegador.
- O wrapper autenticado de imobiliária é permitido; o helper de usuário arbitrário permanece restrito.
- Agendador **desativado**. Não foram gravados clientes, atendimentos, visitas ou notificações de teste no ambiente conectado.

A 0017 corrige a compatibilidade com a permissão real do helper de imobiliária. A 0018 permite reservar novamente uma ocorrência inacabada após edição, protege leases ativos e serializa a conclusão com pausa/edição. As migrations já aplicadas foram preservadas.

## Checks locais

| Check                                | Resultado                                     |
| ------------------------------------ | --------------------------------------------- |
| `bun test --isolate --timeout 30000` | 759 testes passaram, zero falhas              |
| `bun run test`                       | Passou: suíte principal, recibos e assistente |
| `bun run test:assistant`             | 125 testes passaram                           |
| `bun run test:site`                  | 89 testes passaram                            |
| `bun run typecheck`                  | Passou                                        |
| `bun run build`                      | Passou                                        |
| `git diff --check`                   | Passou                                        |

Testes PostgreSQL isolados cobrem confirmação, concorrência, revisão, expiração, RLS, rollback do recibo, função de imobiliária restrita, leases, rotação de autorização, fila, pausa e notificação única. O worker é testado com 20 execuções concorrentes e uma renovação por usuário no lote. Uma autorização temporariamente ocupada não consome tentativa; pesquisa não configurada não é tratada como autorização revogada.

Na prévia com dados sintéticos foram verificados edição antes de confirmar, conclusão com link, contador de pendências, criação/revisão de rotina e layouts desktop/mobile. As funções substituídas são exclusivas do harness de revisão, não da aplicação.

## Capturas

| Estado                    | Desktop                                                   | Celular                                                   |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Proposta pendente         | [Ver](./screenshots/fases-2-3/acao-pendente-desktop.jpg)  | [Ver](./screenshots/fases-2-3/acao-pendente-mobile.jpg)   |
| Editar proposta           | [Ver](./screenshots/fases-2-3/editar-acao-desktop.jpg)    | [Ver](./screenshots/fases-2-3/editar-acao-mobile.jpg)     |
| Concluído                 | [Ver](./screenshots/fases-2-3/acao-concluida-desktop.jpg) | [Ver](./screenshots/fases-2-3/acao-concluida-mobile.jpg)  |
| Falha / registro alterado | [Ver](./screenshots/fases-2-3/acao-falhou-desktop.jpg)    | [Ver](./screenshots/fases-2-3/acao-falhou-mobile.jpg)     |
| Rotinas                   | [Ver](./screenshots/fases-2-3/rotinas-desktop.jpg)        | [Ver](./screenshots/fases-2-3/rotinas-mobile.jpg)         |
| Preferências              | [Ver](./screenshots/fases-2-3/preferencias-desktop.jpg)   | [Ver](./screenshots/fases-2-3/preferencias-mobile.jpg)    |
| Autorização necessária    | [Ver](./screenshots/fases-2-3/reconectar-desktop.jpg)     | [Ver](./screenshots/fases-2-3/reconectar-mobile.jpg)      |
| Precisa de você           | —                                                         | [Ver](./screenshots/fases-2-3/precisa-de-voce-mobile.jpg) |

## Ativação após revisão/publicação

O banco está preparado. A verificação remota confirmou que o segredo do cliente OAuth e a origem do worker **ainda não estão configurados no cofre**. Configure o cliente confidencial, callback, variáveis do servidor e Vault conforme [rotinas-fase-3.md](./rotinas-fase-3.md), publique a rota e só então habilite o cron. Cada usuário conecta sua autorização e confirma suas rotinas.

Pesquisa externa depende de `TAVILY_API_KEY`; custo estimado depende de tarifas versionadas em `ASSISTANT_MODEL_RATES_JSON`. Ausência de configuração permanece visível, sem dados simulados. Não foram medidos gateway, OAuth ou push reais nesta validação; o fluxo real deve ser conferido após a configuração, com usuários e registros de teste. A latência real do primeiro token continua dependente dessa validação.
