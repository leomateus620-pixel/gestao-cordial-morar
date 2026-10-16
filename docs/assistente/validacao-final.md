# Validação e roteiro de revisão — fases 0 e 1

Entrega conjunta das fases 0 e 1: registro único seguro de ferramentas, chat somente leitura e interface contextual. O plano foi publicado na PR antes da implementação, em `plano-fases-0-1.md`. A última revisão visual remove descrições repetidas e mantém detalhes nas apresentações expansíveis.

## Verificações executadas

| Comando                              | Resultado                                                      |
| ------------------------------------ | -------------------------------------------------------------- |
| `bun install --frozen-lockfile`      | passou na base atual do repositório                            |
| `bun test --isolate --timeout 30000` | 728 testes, 112 arquivos, zero falhas                          |
| `bun run test`                       | suítes existentes + recibos + 83 testes do assistente passaram |
| `bun run test:assistant`             | 83 testes passaram novamente após a limpeza final de UI        |
| `bun run test:site` | 89 testes passaram, incluindo políticas PostgreSQL dos sites |
| `bun run typecheck`                  | passou após a revisão final                                    |
| `bun run build`                      | cliente, servidor e pacote Nitro passaram após a revisão final |
| `git diff --check`                   | passou                                                         |

O comando Bun usa isolamento porque a suíte existente compartilha mocks de módulos/ambiente quando executada sem `--isolate`. O timeout explícito evita o limite padrão de cinco segundos em testes PostgreSQL. Os testes não foram ignorados. A CI conserva as suítes do projeto e acrescenta o build.

Cobertura do assistente: matriz papel × ferramenta × imobiliária; máscaras inclusive Unicode e fragmentos de streaming; recusa por bot e por tipo de contexto; limite de oito consultas; timeout/cancelamento; erros do gateway; histórico revalidado após transferência de cliente; RLS real da migration em PostgreSQL isolado; cota concorrente e virada do dia de Brasília; renderização de resultados e fluxo sintético de conversa. Não houve leitura de clientes reais para testes ou capturas.

## Migration e configuração

`0013_assistant_foundation.sql` é aditiva e cria somente persistência/auditoria/cota do assistente. Não foi aplicada no ambiente remoto. Ações de negócio, notificações proativas e memória pertencem às próximas fases.

`env.example` lista variáveis sem valores secretos. `LOVABLE_API_KEY` já existe no servidor do projeto conectado; o diagnóstico sintético dos dois modelos foi bem-sucedido. Ela não foi exportada. Pesquisa externa exige `TAVILY_API_KEY`; ausência retorna indisponibilidade. Mercado permanece inativo nesta fase. Consulte `gateway-validacao.md` para medições e limites.

## Roteiro manual com dados de teste

1. Em homologação, aplicar a migration pelo fluxo habitual e configurar as variáveis do servidor. Criar usuários fictícios admin, secretária, corretor Cordial e corretor Morar; atribuir clientes/atendimentos sintéticos e agendas de teste.
2. Abrir `/assistente/equipe`, conferir catálogo por papel e apresentação de cada bot. Agenda, Match, Capta e Lead permitem conversar; demais bots informam disponibilidade futura apenas aos papéis previstos.
3. Perguntar pela agenda, abrir um registro, usar `@` e `/`, cancelar uma resposta e retomar o histórico. Testar o mesmo fluxo no celular, incluindo os drawers de contexto/equipe e teclado desktop.
4. Buscar um cliente fora da carteira e da agência. Deve estar ausente; CPF, telefone e e-mail devem estar mascarados inclusive em texto livre. Trocar a atribuição de um cliente e reabrir a conversa: os resultados devem ser reconsultados com acesso atual. Trocar papel/agência: o histórico do escopo anterior deve deixar de aparecer.
5. Usar Match com preferências incompletas, conferir motivos e limitações da amostra. Adicionar um imóvel apenas ao rascunho local da seleção e revisar na tela existente. Nenhuma seleção pública ou escrita de negócio deve ser criada pelo agente.
6. Abrir o copiloto em cliente, imóvel e aluguel de teste; conferir contexto e disponibilidade do bot. Testar Cmd/Ctrl+K; no admin, a busca global deve continuar acessível.
7. Simular erro/configuração ausente e confirmar que o produto diferencia erro de “não encontrei”. Verificar a recusa de ações proibidas, rotinas, anexos e bots inativos.
8. Medir primeiro token da conversa integrada e consultas no banco. As medições de primeiro byte do gateway não comprovam os critérios de <2 s e <1 s. Conferir políticas com usuários reais de teste no Supabase antes do merge/deploy.

## Capturas e revisão visual

As capturas usam o harness separado (`bun x vite --config tests/assistant/vite.config.ts`) com componentes reais e dados fictícios. Não existe rota de teste de autenticação incorporada ao app. O harness não representa teste ponta a ponta autenticado no ambiente remoto.

| Estado            | Desktop                                            | Celular                                                                                                |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Boas-vindas       | [Vazio](screenshots/desktop-vazio.jpg)             | [Vazio](screenshots/mobile-vazio.jpg)                                                                  |
| Equipe            | [Conheça a equipe](screenshots/desktop-equipe.jpg) | [Home](screenshots/mobile-home.jpg), [Corretor](screenshots/mobile-home-corretor.jpg)                  |
| Apresentação      | [Agenda](screenshots/desktop-apresentacao.jpg)     | layout responsivo verificado                                                                           |
| Carregando        | [Histórico](screenshots/desktop-carregando.jpg)    | [Histórico](screenshots/mobile-carregando.jpg)                                                         |
| Consultando       | [Progresso](screenshots/desktop-streaming.jpg)     | [Progresso](screenshots/mobile-streaming.jpg)                                                          |
| Concluído         | [Conversa](screenshots/desktop-conversa.jpg)       | [Conversa](screenshots/mobile-conversa.jpg)                                                            |
| Erro              | [Erro](screenshots/desktop-erro.jpg)               | [Erro](screenshots/mobile-erro.jpg)                                                                    |
| Contexto e equipe | laterais no workspace                              | [Contexto](screenshots/mobile-contexto.jpg), [Precisa de você](screenshots/mobile-precisa-de-voce.jpg) |
| Menção e escuro   | componentes compartilhados                         | [Menção](screenshots/mobile-mencao.jpg), [Escuro](screenshots/mobile-escuro.jpg)                       |

Revisão comparativa e histórico de correções em `../../design-qa.md`. Não houve deploy, aplicação remota de SQL, emissão fiscal, publicação de imóvel ou envio de mensagem a clientes.
