# Interface — fases 2 e 3

A implementação mantém o workspace, os personagens, a marca e os tokens já aprovados. A conversa continua sendo o centro da experiência; detalhes e preferências ficam em painéis compactos.

## Ações

`RichToolResult` reconhece propostas estruturadas de ação, rotina e preferência. `ActionCardView` mostra o resumo, o antes/depois e o prazo da proposta. Confirmar, Editar e Cancelar são cliques explícitos; renderizar um cartão não executa uma operação.

O editor oferece campos próprios de cada ação: título e intervalo da agenda, texto da nota/rascunho, etapa e motivo, ou título/mensagem/validade/ordem dos imóveis da seleção. Não há editor de JSON. As referências aos registros são preservadas e os schemas compartilhados validam a proposta.

Após confirmar, o cartão usa o estado retornado pelo servidor. Concluído apresenta o link do registro; rascunho apresenta Copiar. Cancelado, expirado, falhou e confirmando não oferecem uma segunda confirmação. Erros permitem verificar o resultado sem repetir a execução automaticamente. Instâncias do mesmo cartão compartilham o estado por identificador.

“Precisa de você” recebe a lista real de propostas. Um clique abre um painel com as pendências, sem repetir informações de segurança no restante da tela.

## Rotinas e preferências

A aba Rotinas permite descrever um acompanhamento, revisar nome/frequência/horário de Brasília e confirmar. Pausar, retomar, editar e excluir têm controles explícitos; excluir pede a confirmação no próprio item. O histórico apresenta estado e horário da execução, com link para seus resultados. Propostas novas conservam o identificador de idempotência até a resposta definitiva.

O painel de conexão distingue autorização ausente ou revogada, configuração pendente e agendador ainda desativado. Conectar inicia o OAuth individual; desconectar exige um clique de confirmação. O sucesso visual depende da resposta do servidor.

Preferências ficam no botão do cabeçalho e incluem somente tom, bairros de foco e horário. Guardar e apagar são decisões explícitas do usuário, com validação compartilhada. Uma falha ao carregar preferências bloqueia a gravação de valores presumidos.

Links de notificação abrem `/assistente` com identificadores validados de rotina, execução, conversa ou ação. Resultados de execuções são consultados novamente com o acesso atual do usuário.

## Verificação

`ActionCard.test.tsx` verifica que renderizar uma proposta não confirma, ações expiradas/em processamento não oferecem nova confirmação, rascunhos não alegam envio, o editor não expõe JSON/IDs e erros de rotinas não se tornam listas vazias bem-sucedidas. Os testes existentes de resultados ricos continuam cobrindo links permitidos, papéis e dados ausentes.

O harness isolado em `tests/assistant` inclui estados de proposta pendente, editor, concluído, falha, rotinas, preferências e reconexão. Suas funções são substituídas somente pela configuração Vite de revisão e usam dados sintéticos. A aplicação de produção continua usando as funções autenticadas.

Para revisão manual: confirmar uma proposta e abrir o registro; editar e revisar a nova versão; cancelar e expirar; interromper a rede e verificar o resultado; criar/pausar/retomar/excluir rotina; revisar frequência em Brasília; reconectar autorização; guardar/apagar preferências; abrir uma execução por notificação. Repetir em desktop e celular, conferindo teclado, foco e ausência de conteúdo cortado.
