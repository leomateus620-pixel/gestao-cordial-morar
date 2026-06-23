## Objetivo

Disparar o e-mail de teste para `leomateus620@gmail.com` agora que o app foi publicado e as rotas `/lovable/email/transactional/send` e `/lovable/email/queue/process` estão ativas em produção.

## Passos

1. **Confirmar rota viva** — `GET`/`POST` em `https://cordialgestao.com/lovable/email/transactional/send` para garantir que retorna 401 (rota deployada) e não 404.

2. **Disparar envio autenticado** — chamar `POST /lovable/email/transactional/send` via `stack_modern--invoke-server-function` (que injeta o JWT da sessão do preview), payload:
   - `templateName: "first-attendance-thank-you"`
   - `recipientEmail: "leomateus620@gmail.com"`
   - `idempotencyKey: "manual-test-<timestamp>"`
   - `templateData`: `{ clienteNome: "Leonardo Mateus", imobiliaria: "cordial", finalidade: "compra", tipoImovel: "apartamento", regiao: "Centro", orcamentoMin: 300000, orcamentoMax: 500000 }`.

3. **Validar** — após ~10s consultar `email_send_log` pelo `message_id`/`recipient_email` e confirmar `status = 'sent'`. Se ficar `pending`, aguardar mais um ciclo do cron (5s). Se `failed`/`suppressed`/`dlq`, ler `error_message` e reportar a causa.

4. **Reportar** ao usuário com o resultado final e pedir para conferir caixa de entrada e spam.

## Arquivos

Nenhuma alteração de código. Apenas requisição HTTP autenticada + leitura de tabela.

## Limitações

- Primeiro envio do domínio pode cair em spam.
- Se `leomateus620@gmail.com` estiver em `suppressed_emails`, removo a supressão e tento de novo.
