## Objetivo

Finalizar a ativação do sistema de e-mails (cron da fila) e disparar um e-mail real de teste para `leomateus620@gmail.com` usando o template `first-attendance-thank-you`.

## Domínio

`notify.cordialgestao.com` está verificado. Nenhuma ação de DNS é necessária.

## Passos

1. **Ativar a fila** — executar `email_domain--setup_email_infra` (idempotente) para garantir que o cron `process-email-queue` esteja registrado e disparando a cada 5s contra `/lovable/email/queue/process`.

2. **Disparar e-mail de teste** — chamar `POST /lovable/email/transactional/send` com a sessão autenticada do preview, payload:
   - `templateName: "first-attendance-thank-you"`
   - `recipientEmail: "leomateus620@gmail.com"`
   - `idempotencyKey: "manual-test-<timestamp>"`
   - `templateData`: dados realistas de exemplo (clienteNome "Leonardo Mateus", imobiliaria "cordial", finalidade "compra", tipoImovel "apartamento", regiao "Centro", orçamento exemplo).

3. **Validar** — em até ~10s consultar `email_send_log` filtrando pelo `message_id` retornado e confirmar `status = 'sent'`. Se ficar em `pending`, aguardar próximo ciclo do cron; se `failed`/`dlq`, ler `error_message` e reportar.

4. **Reportar ao usuário** — confirmar envio (ou expor a causa exata da falha) e lembrar de checar a caixa de entrada / spam.

## Arquivos

Nenhum arquivo de código será alterado. Apenas chamadas de infraestrutura e uma requisição HTTP de teste.

## Limitações

- Primeiro e-mail para um domínio novo pode cair em spam até o IP de envio aquecer.
- Se o destinatário já estiver em `suppressed_emails`, o envio retorna `email_suppressed` — nesse caso removeremos a supressão e tentaremos de novo.
