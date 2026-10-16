# Cordial Bot — fase 4

Base: main 703aa946 (PR #31 incorporada). Configuração única Cordial/Morar, sete bots fixos e aplicativos MCP aprovados pelo administrador.

## Plano antes da implementação

1. Expor as cinco preparações e consulta de estado pelo MCP com identidade OAuth verificada, aprovação administrativa, idempotência por requestId e confirmação exclusivamente na sessão pessoal do Gestão.
2. Centralizar configurações efetivas para UI, chat, rotinas e ferramentas. Administração permite ativar, instruções complementares, sugestões, prévia e restauração com revisão. Desativar invalida pendências e pausa rotinas; revogar aplicativo invalida suas propostas.
3. Aplicar a marca compartilhada Cordial Bot preservando símbolo e mascotes. Refinar a interface atual com Product Design: contexto controlável, escolhas estruturadas, próximos passos reais, pendências mobile e composer adequado ao teclado/safe area. Detalhes expansíveis e sem descrições repetidas.
4. Criar migrations aditivas sequenciais a partir de 0019, aplicar SQL versionado pelo conector no projeto Gestão Cordial e verificar RLS, grants, histórico e cache. Não fazer deploy nem ativar cron.
5. Testar isolamento, concorrência, expiração, revogação, configuração e confirmação. Executar Bun, typecheck/build e regressões; capturar estados desktop/mobile sintéticos e documentar dependências operacionais.

## Limites

Leituras de negócio usam supabaseForUser/RLS. Não existe ferramenta de execução externa, SQL do modelo, marketplace ou novos bots genéricos. Papéis/ferramentas máximos e proibições permanecem no código. Migrations aplicadas não serão editadas. Rotas e identificadores existentes serão preservados.

## Critérios de revisão

PR única, migrations comprovadas, testes passando e screenshots. Aprovação do aplicativo MCP não substitui consentimento pessoal nem confirmação de cada ação. Prontidão distingue schema, código sincronizado e runtime publicado; fase 3 não é anunciada como ativa sem configuração operacional.
