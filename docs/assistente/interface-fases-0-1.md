# Interface do Assistente Cordial — fases 0 e 1

As referências fornecidas orientam a presença dos personagens, a navegação como uma conversa de trabalho e as respostas compostas por registros. Os mascotes são SVGs autorais leves, com formas e cores próprias. Nenhuma funcionalidade de negócio dos produtos de referência foi incorporada.

A marca própria do Assistente combina a geometria da Cordial e o telhado/M da Morar, nas cores do Gestão. Substitui a estrela genérica no menu, workspace, busca rápida e briefing, e identifica o copiloto e a equipe mobile. O arquivo gerado é compartilhado pelo componente `AssistantMark`; os logos existentes dos sites foram preservados. Fontes e derivados em `identidade/README.md`.

## Percurso entregue

- `/assistente/equipe`: primeiro acesso, equipe filtrada pelo papel, busca e categorias; cards com função curta, módulos e disponibilidade.
- `/assistente/equipe/{bot}`: apresentação completa, habilidades, funcionamento, dados e papéis, pedidos prontos, limites e ideias de rotinas explicitamente futuras.
- `/assistente`: no desktop, boas-vindas no espaço de trabalho; no celular, lista de agentes em estilo mensageiro e aba de conversas recentes.
- `/assistente/{bot}`: histórico, conversa e contexto; no celular, equipe e contexto abrem em drawers. A navegação inferior do Gestão é recolhida somente nessa nova rota para deixar espaço ao composer.
- Copiloto nas telas do Gestão: identifica imóvel/cliente pelo caminho e outros registros por `?id=`, consulta os dados autorizados e continua a mesma conversa no espaço do agente.
- `Cmd/Ctrl+K`: abre o assistente para perfis operacionais. Para administradores, mantém a busca global existente com uma nova ação para perguntar à equipe. A busca por registros continua funcionando.
- “Seu dia”: consultas reais na home e ao abrir uma conversa vazia, com estado de indisponibilidade distinto de zero resultados.

Agenda, Match, Capta e Lead estão disponíveis para consulta. Caixa, Time e Mercado aparecem somente aos papéis previstos, com apresentação de capacidades futuras e sem botão para iniciar chat. O cadastro atual não armazena vencimento de agenciamentos; Capta informa pendências sem inventar datas.

## Estados e componentes

O workspace tem estados vazio, carregando histórico, consultando ferramentas, recebendo resposta, resultado vazio, concluído e erro. A timeline mostra somente operações realmente emitidas pelo servidor. O usuário pode interromper a resposta. “Nova conversa” descarta o estado local da conversa anterior sem excluir o histórico salvo.

`WorkerAvatar`, `WorkerList`, `AgentCard`, `AgentSidebar`, `AssistantWorkspaceView`, `EmptyStateHero`, `ChoiceChips`, `Composer`, `StepTimeline`, `RichPropertyCard`, `RichToolResult`, `ContextPanel`, `NeedsYouSection`, `DailyBriefingView`, `MobileAssistantHomeView`, `RoutinesTab` e o copiloto usam os componentes e tokens do Gestão. A interface respeita movimento reduzido, estados de foco, nomes acessíveis dos controles e anúncios de carregamento e erro.

A hierarquia privilegia a conversa, os registros e as ações. A equipe apresenta uma frase curta por agente, sem faixas explicativas ou avisos repetidos. Nas apresentações, habilidades e exemplos ficam visíveis; ações futuras, dados e papéis, limites e rotinas ficam em seções expansíveis acessíveis pelo teclado. O conteúdo obrigatório continua disponível sem ocupar a tela inicial. Erros reais e indisponibilidades, como o Caixa ainda inativo, permanecem explícitos no ponto em que afetam uma decisão.

O composer oferece pedidos com `/`, busca autorizada de registros com `@` e ditado apenas quando o navegador oferece reconhecimento de voz. O ditado começa mediante clique e deixa o texto em rascunho; nunca envia automaticamente. Anexos ficam desabilitados com explicação enquanto não existe fluxo seguro para ler documentos.

Os resultados renderizam apenas campos selecionados. Links internos aceitam somente módulos conhecidos; fontes externas aceitam HTTPS sem credenciais. A ausência de foto é representada por um ícone. “Seleção” modifica apenas o rascunho de IDs por usuário já existente; a criação do link continua no fluxo de Seleções.

Confirmações, rotinas, memória, novos agentes e execução em segundo plano pertencem às fases seguintes. A interface não finge que esses recursos estejam ativos. “Precisa de você” informa que não há confirmações nesta fase; a aba Rotinas mostra somente ideias sem ação de ativação.

## Validação manual com dados sintéticos

1. Entrar com cada papel em ambiente de teste, abrir a equipe e conferir os agentes disponíveis. Corretor não deve ver Caixa, Time ou Mercado; secretária não deve ver Time ou Mercado.
2. Abrir Agenda, enviar um pedido, conferir etapas e registros, depois retomar a conversa salva. Interromper uma resposta e iniciar outra; o envio antigo não deve mudar o estado da nova resposta.
3. Usar `@` para buscar um cliente ou imóvel sintético; conferir o contexto. No Match, conferir critérios faltantes e justificativas do score.
4. Adicionar imóvel ao rascunho de seleção e abrir Seleções para revisar. Nenhum link é criado automaticamente.
5. Abrir o copiloto de um registro sintético, consultar e continuar no workspace. Conferir a manutenção da conversa e do contexto.
6. Testar erros de configuração, histórico e consulta. Não devem aparecer zeros ou listas vazias como se a consulta tivesse funcionado.
7. Conferir celular e desktop, teclado, contraste, modo escuro e preferência de movimento reduzido. O harness em `tests/assistant` usa componentes reais com dados sintéticos e não cria rota de autenticação no app.
