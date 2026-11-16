# Acompanhamento interno dos bots

Implementado a partir de `065bfb1d9c85b9656231f5e0d1c677b0acd645b5`, na branch `codex/public-bot-insights`. Os bots existentes já estavam publicados e validados pelo solicitante. Esta entrega acrescenta acompanhamento no **Painel** do Gestão, para o administrador, e substitui os mascotes por artes próprias das marcas.

## Experiência

Dois cards, Cordial e Morar, compartilham o período Hoje / 7 dias / 30 dias, pelo calendário de `America/Sao_Paulo`. Acessos e WhatsApp recebem maior destaque; novas sessões e conversas iniciadas aparecem como apoio. Cada gráfico permite alternar a série e consultar dias por ponteiro ou teclado. A lista paginada abre o detalhe da sessão, com preferências iniciais/atuais e linha do tempo filtrável por envios ou cliques.

O desenho reaproveita tokens, fontes, Sheet, foco e composição do Painel. Product Design e as referências Apple Design de hierarquia, controles previsíveis, legibilidade e movimento orientaram o refinamento. Não há nova dependência de gráficos: SVG representa dados, com tabela acessível equivalente. Animações respeitam movimento reduzido. As artes originais e a produção Creative Production estão documentadas em [mascots.md](mascots.md).

## Significado dos números

| Medida              | Definição                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Acessos             | Aberturas confirmadas pelo navegador depois de carregar a sessão. Repetir o mesmo evento não soma novamente. |
| Novas sessões       | Sessões públicas observadas pela primeira vez no acompanhamento. Não equivalem a pessoas únicas.             |
| Conversas iniciadas | Sessões que receberam seu primeiro envio aceito durante o período.                                           |
| Envios              | Turnos aceitos, inclusive cumprimentos, seleções confirmadas e mensagens fora de escopo. Retry não duplica.  |
| WhatsApp            | Cliques registrados nos contatos do bot. Não confirma envio de mensagem, atendimento ou negócio.             |
| Lista de sessões    | Sessões com atividade no período; pode incluir uma conversa iniciada antes dele.                             |

Uma sessão iniciada ontem que recebe outro envio hoje soma atividade hoje, mas não outra sessão/conversa iniciada. Cordial e Morar mantêm contagens e detalhes separados. A cota pública compartilhada de IP permanece intacta.

`trackingSince` informa o início da coleta. Não há reconstrução de perguntas anteriores à implementação. A migração captura novos turnos e suas conclusões imediatamente; abertura, texto minimizado e clique dependem da implantação do código desta PR. O painel identifica períodos com histórico parcial.

## Arquitetura e fronteiras

`public_bot.insight_*` contém agregados diários, sessões observadas, deduplicação e evolução. Um gatilho de turnos registra aceitação, conclusão e interrupção na mesma transação da conversa. As operações fechadas `insight_open`, `insight_turn` e `insight_whatsapp` passam pelo gateway já existente. O modelo não recebe novos dados, permissões ou ferramentas.

Abertura e clique usam o endpoint existente `POST bot/events`, com contrato estrito, origem e cookie da marca. Uma abertura só é confirmada após receber a sessão: perder a primeira resposta e tentar novamente sem cookie não cria uma abertura fictícia. Cliques em cards precisam mencionar um ID realmente apresentado naquela sessão; retirada posterior do anúncio não apaga o fato histórico do clique. Nenhum snapshot de preço ou mídia do imóvel é copiado para as estatísticas.

As funções administrativas `public_bot_insights`, `public_bot_conversations` e `public_bot_conversation` são chamadas por server functions POST com `requireSupabaseAuth`, respostas `no-store` e contratos Zod estritos. A autoridade final é PostgreSQL: administrador obrigatório e bloqueio dominante de `meta_reviewer` e `atendimentos_viewer`. O leitor administrativo é um papel separado, sem login, sem escrita e sem leitura de imóveis/clientes/finanças. O runtime público não lê o acompanhamento e não executa as funções administrativas. Não se reutiliza o backend do assistente interno.

O guard administrativo, fechado e sem argumentos, pertence a `postgres` e verifica identidade e papéis. Isso evita conceder ao leitor acesso ao schema `auth`, cujo proprietário não permite delegar USAGE pelo executor de migrações. As três consultas administrativas continuam sob o leitor mínimo. Todos os nomes são estáticos, com `search_path` fixo e grants explícitos.

## Dados e privacidade operacional

Conforme a orientação do solicitante, a coleta operacional interna não exige um novo consentimento ou altera o fluxo de pesquisa. Consentimento existente de Meta/GTM/analytics e tendências continua independente e respeitado. Perguntas, respostas e identificadores de sessão não são enviados a essas ferramentas.

Armazenam-se perguntas minimizadas de até 1.000 caracteres, respostas controladas de até 800, filtros tipados, IDs públicos e eventos. HTML, links e padrões detectáveis de dados pessoais são removidos antes de persistir, com defesa adicional no banco. Detecção por padrões não é garantia de anonimização; o acesso permanece restrito ao administrador. Não há áudio, IP bruto, cookie, segredo, prompt ou vínculo automático com cadastro de cliente no acompanhamento. Os resumos usam filtros e templates determinísticos, sem chamada adicional à IA.

Detalhes ficam até 30 dias após a última atividade; agregados diários, por 90 dias de calendário. O cleanup existente executa a limpeza e marca turnos abandonados como interrompidos. O detalhe retorna no máximo 500 eventos recentes, informando explicitamente truncamento. Sessões do bot continuam com sua retenção original, separada da análise interna.

Contagem de aberturas e cliques é de melhor esforço: rede indisponível, bloqueio do navegador ou ausência de uma sessão válida podem impedir registro. O clique nunca fica bloqueado esperando analytics. Falha na coleta de perguntas gera apenas código técnico, marca e operação em observabilidade; nunca texto do visitante. Não há criação automática de leads.

## Migração, entrega e recuperação

`0098_public_bot_insights.sql` foi gerada com `drizzle-kit generate --custom`, com journal e snapshot produzidos pelo mecanismo do projeto. Foi aplicada exclusivamente pelo conector Lovable ao projeto Gestão Cordial `feb646c9-c19a-4360-8cc9-bec5237532ea`, com precondição da 0097 e registro atômico de hash/horário no journal. Nenhuma mensagem foi enviada ao chat Lovable. Não são necessárias novas variáveis, segredos ou configuração de ingresso.

Após integrar a PR, conferir como administrador: Painel → Busca nos sites → período → Ver sessões. Fazer uma pesquisa real em cada marca, refinar e clicar voluntariamente no WhatsApp; a próxima leitura do painel deve mostrar a atividade. Cache de interface é separado por usuário, marca e período, com stale time de 15–30 segundos; foco/refetch atualiza sem recarregar a aplicação inteira.

Rollback de interface: reverter o commit da PR; os bots continuam compatíveis com a 0098. Se necessário suspender toda a coleta, gerar nova migração pelo Drizzle, via conector Lovable, removendo o gatilho e revogando os três novos despachos de gravação, preservando os 14 existentes. Não editar 0098 aplicada, não apagar o journal e não mexer em cotas, publicação, credenciais ou ingresso. Dados existentes podem permanecer restritos e expirar pelo cleanup.

Ensaios de banco, permissões e medidas observadas estão em [evidence/insights-database.md](evidence/insights-database.md). Prévia sintética: `npm run preview:public-bot-insights`, em `/tests/public-bot-insights/preview.html`; ela nunca é usada como fonte do painel real.
