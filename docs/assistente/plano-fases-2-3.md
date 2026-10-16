# Assistente Cordial — plano de implementação das fases 2 e 3

Entrega em uma PR, sem deploy. Base: main após ativação da fundação do assistente.

1. Ações: propostas validadas, revisão, expiração de 15 minutos, confirmação explícita, cancelamento e edição. Escritas com token do usuário; comprovante transacional impede duplicação. Reusar regras de agenda, atendimento e seleções. Nenhuma ferramenta de execução disponível ao modelo.
2. Interface: cartões com antes/depois, estados de execução e links; pendências reais; rotinas, preferências e reconexão. Preservar identidade, animações e textos curtos.
3. Rotinas: autorização OAuth individual independente da sessão interativa, segredos no cofre, consultas via token/RLS, fila exclusiva, três tentativas, briefing diário às 8h de Brasília e push genérico deduplicado. Cron desativado até publicação da rota.
4. Preferências estruturadas sob controle do usuário; bots Caixa, Time e Mercado respeitam permissões. Painel administrativo em Configurações, métricas reais e custo desconhecido indicado como indisponível.
5. Migrations aditivas sequenciais aplicadas pelo conector no projeto Gestão Cordial após validação local. Verificar schema/RLS remotamente sem dados reais de clientes. Não publicar aplicação.

Validação: concorrência/idempotência, expiração, usuário/papel/imobiliária, autorização revogada, fuso e duplicação de push; Bun, typecheck, build e regressões dos comandos existentes. Capturas desktop/mobile com dados sintéticos. Limitações de credenciais/ativação devem constar na PR.
