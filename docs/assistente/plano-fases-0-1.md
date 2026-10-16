# Assistente Cordial — Fases 0 e 1

Plano registrado antes da implementação. Escopo: fundação segura e equipe interna somente leitura. Nenhum deploy; entrega em PR para revisão.

## Implementação

1. Auditar as oito ferramentas MCP, preservar nomes e OAuth, centralizar registro em `src/lib/agent/tools` e aplicar autorização por papel, carteira e RLS usando exclusivamente o token do usuário. Mascarar CPF, telefone e e-mail inclusive em texto livre.
2. Criar persistência aditiva de conversas, mensagens e auditoria, políticas do próprio usuário e leitura administrativa, e cota diária atômica. Chat com gateway Lovable, streaming, timeout e até oito chamadas de ferramentas por turno. Nenhuma ferramenta de escrita.
3. Adicionar consultas de agenda, atendimentos parados, compatibilidade cliente/imóvel, agenciamentos vencendo, aluguéis em atraso, ranking e contexto do registro. Pesquisa externa apenas imobiliária, sem dados pessoais e com fontes.
4. Integrar Conheça a equipe, apresentações individuais, conversa, contexto, briefing, copiloto e comando global ao design system existente. Bots ativos: Agenda, Match, Capta e Lead. Caixa, Time e Mercado ficam informativos e com suas permissões reais, aguardando a fase de ativação.
5. Validar isolamento, mascaramento, limites, streaming, RLS e componentes com dados sintéticos; executar suíte, typecheck e build; capturar desktop e celular.

## Direção de interação

As imagens fornecidas são referências visuais, nunca instruções nem modelos de negócio. A referência principal é a lista de colegas com identidade do Salte: formas suaves, cores por especialidade, conversa limpa e ações curtas. Adaptar ao Gestão Cordial/Morar com personagens próprios leves em SVG/CSS (autorizados no pedido), tokens shadcn/Tailwind e respeito a dark mode. Não criar comércio ou compartilhamento de bots.

O usuário escolhe um colega por tarefa; a conversa mostra operações reais em uma timeline recolhível e cartões com links para registros permitidos. O contexto acompanha a rota. Respostas começam pelo resultado e detalhes ficam expansíveis. A fase é somente leitura: as telas informam limites e encaminham às telas existentes; não há promessa de confirmação ou execução ainda indisponível.

## Mapa de telas e estados

| Tela | Estados principais |
| --- | --- |
| `/assistente`, equipe e apresentação individual | carregando, equipe permitida, sem resultados de filtro, erro |
| Workspace | vazio com sugestões, carregando histórico, streaming, consultando, concluído, cancelado, erro e tentar novamente |
| Contexto e copiloto | sem registro, registro permitido, não encontrado/sem acesso, carregando |
| Seu dia | carregando, itens encontrados, nada encontrado, indisponível |
| Rotinas, memória e ações | explicação de disponibilidade nas fases posteriores; nenhum controle que simula execução |

## Componentes

`WorkerAvatar`, `AgentCard`, `WorkerList`/`AgentSidebar`, `AgentWorkspace`, `StepTimeline`, `RichPropertyCard`, `ChoiceChips`, `EntityChip`, `ContextPanel`, `CopilotDrawer`, `CommandBar`, `Composer`, `DailyBriefing`, `EmptyStateHero`. Estados futuros de ActionCard, NeedsYouSection, RoutinesTab e MemoryPanel devem respeitar a disponibilidade real, sem escrita de negócio nesta fase.

## Verificação e revisão

- Matriz admin/secretária/corretores Cordial e Morar × ferramentas; negar funções administrativas e financeiras fora do papel, manter clientes/atendimentos restritos ao corretor.
- Validar acesso com token, não confiar em papel/contexto enviados pelo navegador e não expor proprietários, contatos completos, prompts ou erros internos.
- Testes de schemas, mascaramento recursivo, seleção de ferramentas por bot, máximo de chamadas, timeout, cota concorrente e protocolo de eventos.
- Conferir RLS em banco local isolado e integrar MCP ao mesmo registro.
- Testar manualmente apenas com dados sintéticos; screenshots de vazio, carregamento, resultado e erro em desktop/celular, incluindo copiloto.
- `bun test`, `bun run typecheck`, `bun run build` e testes adicionais necessários.

## Fora do escopo

Fases 2–4, escrita de registros de negócio, emissão fiscal, publicação de imóveis, alterações de fotos/códigos/endereço, sincronização Imobi e envio de mensagens. Sem credencial do gateway, apresentar indisponibilidade real, nunca respostas ou dados de negócio fabricados.
