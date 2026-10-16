# Cordial Bot — fase 4

Configuração interna dos sete especialistas e propostas via MCP. Não existe execução pelo MCP, catálogo público de bots ou ampliação de papéis por instruções administrativas.

## Administração

Em **Configurações → Cordial Bot → Equipe**, escolha o especialista, edite orientações e sugestões e use **Revisar alterações → Confirmar alterações**. Os limites de ferramentas, módulos, privacidade e confirmação permanecem no servidor. Uma revisão antiga gera conflito e oferece recarregar; restaurar o padrão também exige revisão e informa a ativação do bot.

A configuração é única para Cordial/Morar. Desativar cancela propostas pendentes e pausa rotinas. Reativar não restaura propostas ou rotinas; retomar uma rotina exige ação pessoal. Conversas antigas permanecem registradas, sem reconsultar ferramentas de um bot pausado.

Em **Conexões MCP**, aprove apenas clientes OAuth já registrados no Auth. A listagem e a validação usam metadados do provedor no servidor e nunca enviam segredos ao navegador. A aprovação permite preparar propostas; não substitui o consentimento individual. Revogar impede novas preparações e cancela pendências dessa origem. As oito consultas MCP existentes mantêm suas permissões; para revogar o consentimento de leitura, a pessoa deve revogar a autorização OAuth correspondente.

## Preparar fora, confirmar no Gestão

O endpoint e o identificador MCP `gestao-cordial` foram preservados. Aplicativos aprovados veem até cinco preparações, conforme os bots/papéis disponíveis, e `get_action_status`, além das oito consultas existentes.

1. Autorizar o aplicativo com uma conta de teste apropriada ao papel.
2. Chamar uma preparação com `requestId` UUID e os campos tipados da ação. Nunca fornecer usuário, papel, bot, cliente OAuth ou comando de execução.
3. Abrir `confirmationUrl`, autenticar-se com a sessão pessoal no Gestão e revisar o cartão.
4. Confirmar, editar ou cancelar no Gestão. Consultar o resultado no registro real ou por `get_action_status`.

Repetir a mesma chave e os mesmos argumentos retorna a mesma proposta, sem renovar seus 15 minutos. Conteúdo diferente gera conflito. A origem vem do JWT assinado; a RLS também restringe ações e recibos ao próprio usuário e aplicativo aprovado, inclusive para OAuth de administrador. Reaprovar um cliente não ressuscita propostas antigas. Há limites de 100 propostas pendentes por usuário/escopo e 25 por aplicativo.

As preparações registram apenas propostas. O comprovante privado nunca sai do servidor; confirmar reutiliza o comando transacional existente sob o token pessoal. Queda depois da gravação recupera o resultado sem repetir o efeito.

## Configuração e publicação

`ASSISTANT_PUBLIC_ORIGIN` deve ser a origem HTTPS canônica do Gestão, sem caminho, credenciais ou parâmetros. O link externo usa somente `/assistente?action=<UUID>`, nunca token ou comprovante. Origem ausente gera erro objetivo antes de criar a proposta; não há fallback para o cabeçalho Host.

As migrations **0019 e 0020 foram aplicadas pelo conector** na conta Cordial, projeto Gestão Cordial (`feb646c9-c19a-4360-8cc9-bec5237532ea`). O arquivo [validacao-remota-fase-4.json](validacao-remota-fase-4.json) registra hashes, políticas e privilégios.

- 0019: configurações, aprovação MCP, origem/idempotência de propostas, RLS por cliente e proteção transacional de confirmação.
- 0020: mantém as escritas de metadados usadas pelo runtime da fase 3, com RLS e gerações de ativação. Uma execução antiga não pode voltar após desativar/reativar, mesmo se uma escrita concorrente terminar depois.

Schema aplicado não significa runtime publicado. Na conferência remota, o Lovable ainda apontava para a `main` `703aa946`, enquanto o código desta fase está na PR. **Não foi feito deploy, merge ou ativação de cron.** Após revisão, incorporar/publicar a PR pelo fluxo normal e então homologar OAuth e MCP com contas sintéticas. Nenhum cliente real foi criado ou alterado para os testes.

As dependências operacionais da fase 3 continuam separadas: cliente OAuth confidencial/PKCE, segredo e origem do worker no Vault, autorização pessoal e habilitação explícita do agendador após publicação. Na verificação remota, os dois segredos continuavam ausentes e o cron desligado. A fase 4 não afirma que rotinas já estão ativas.

## Experiência e validação manual

As escolhas de conversa não confirmam ações. Elas produzem uma nova mensagem com pergunta e opção; “Outro…” apenas foca o composer. Os próximos passos usam contexto e resultados estruturados reais. O rascunho transferido do copiloto fica somente no navegador, separado por usuário/bot, expira em cinco minutos e é consumido uma vez.

No harness `tests/assistant/preview.html`, usar os estados Escolhas, Admin equipe, Admin MCP, Conflito, Ação pendente/concluída/falhou, Editar ação e Reconectar. O transporte é exclusivamente sintético; a configuração Vite de produção não usa esses aliases.

Testes manuais realizados no navegador: escolher/usar “Outro…”, selecionar `@` com setas/Enter, remover contexto, confirmar proposta e atualizar contador 1→0, revisar aprovação MCP e recuperar conflito administrativo. Capturas em 320/390/430 px, tablet e desktop; composer também verificado em viewport de altura reduzida. Teclado físico de iPhone/Android, OAuth/gateway reais e latência de produção ainda exigem homologação após publicação.

## Evidências

- `bun test --isolate --timeout 30000`: **792 passaram, zero falhas**.
- `bun run test`: passou, incluindo **158 testes do assistente** e os testes de recibos.
- `bun run test:site`: **89 passaram**.
- Typecheck e build: passaram.
- PostgreSQL isolado/PGlite: origem OAuth, papéis/agências, prova privada, CAS, expiração, repetição, revogação, gravação/recibo/rollback e compatibilidade do runtime anterior. O teste de corrida de gerações reproduz o estado após commit concorrente; PGlite não representa duas conexões PostgreSQL independentes.
- Transporte MCP real de teste: JWT ES256 assinado, JWKS local, descoberta condicional, token inválido, chamada direta e revogação após descoberta.

| Estado | Desktop | Celular |
|---|---|---|
| Conversa vazia / equipe mobile | [Desktop](screenshots/fase-4/empty-desktop.jpg) | [Celular](screenshots/fase-4/mobilehome-mobile.jpg) |
| Proposta | [Desktop](screenshots/fase-4/action-pending-desktop.jpg) | [Celular](screenshots/fase-4/acao-mobile.jpg) |
| Concluído | [Desktop](screenshots/fase-4/action-executed-desktop.jpg) | [Celular](screenshots/fase-4/acao-concluida-mobile.jpg) |
| Edição | [Desktop](screenshots/fase-4/action-edit-desktop.jpg) | [Celular](screenshots/fase-4/action-edit-mobile.jpg) |
| Falha | [Desktop](screenshots/fase-4/action-error-desktop.jpg) | [Celular](screenshots/fase-4/action-error-mobile.jpg) |
| Escolha | [Desktop](screenshots/fase-4/choices-desktop.jpg) | [Celular](screenshots/fase-4/choices-mobile.jpg) |
| Administração | [Desktop](screenshots/fase-4/admin-team-desktop.jpg) | [Celular](screenshots/fase-4/admin-team-mobile.jpg) |
| MCP | [Desktop](screenshots/fase-4/admin-mcp-desktop.jpg) | [Confirmar aprovação](screenshots/fase-4/aprovar-mcp-mobile.jpg) |
| Reconexão | [Desktop](screenshots/fase-4/reconnect-desktop.jpg) | [Celular](screenshots/fase-4/reconnect-mobile.jpg) |

[Conflito](screenshots/fase-4/conflito-configuracao-mobile.jpg), [320 px](screenshots/fase-4/acao-320.jpg), [tablet](screenshots/fase-4/conversa-tablet.jpg), [altura reduzida](screenshots/fase-4/composer-altura-reduzida.jpg).
