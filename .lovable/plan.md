## Objetivo

Pausar a sincronização automática da planilha do Google (Financeiro) e limpar o histórico de logs de sincronização.

## O que será feito

1. **Desativar o job automático**
   - O job `financeiro-sheets-autosync` roda a cada 5 minutos e é o que gera os logs. Ele será desativado (não removido), para poder ser religado depois sem refazer a configuração.
   - Os outros jobs (lembretes da agenda e Google Agenda) continuam ativos, sem alteração.

2. **Limpar os logs**
   - Apagar todos os 4.057 registros de `financeiro_sync_log`.

3. **Refletir na interface**
   - Na tela de integração do Financeiro, mostrar um aviso de que a sincronização automática está pausada, mantendo os botões de Prévia e "Importar agora" para importação manual quando necessário.

## Observações

- A planilha continua vinculada; nada dos lançamentos já importados é apagado.
- Para religar depois, basta pedir e o job volta a ficar ativo.

## Detalhes técnicos

- Migração: `SELECT cron.alter_job(18, active := false);` e `TRUNCATE public.financeiro_sync_log;`
- Ajuste visual em `src/components/financeiro/GoogleSheetsIntegration.tsx` (badge/aviso "Sincronização automática pausada").
