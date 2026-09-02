# Enviar as 2 notificações de teste para o Leonardo

O iPhone do Leonardo já aparece registrado (1 dispositivo, iOS 18.7, registrado às 18:08 de hoje). Com isso, o envio real de push finalmente é possível.

## O que será feito

1. Disparar as duas notificações de teste pelo pipeline normal (mesmo caminho de qualquer aviso do sistema — nada de atalho especial):
   - "Teste 01" — mensagem curta de validação.
   - "Foi vinculado um atendimento a você" — "Abrir?", com link para /atendimentos.
2. Acordar o worker de push para processar a fila imediatamente.
3. Conferir na fila se as duas saíram como enviadas (e não como ignoradas), e checar se o token continua válido depois do envio.
4. Se o Firebase recusar o token (token vencido de iPhone é comum), reportar o motivo exato e o que o Leonardo precisa refazer no aparelho.

## Detalhes técnicos

- Uso do fluxo já existente: inserção em `notifications` → trigger `notifications_enqueue_push` → `push_outbox` → worker `/api/public/hooks/push-worker` (FCM HTTP v1).
- Nenhuma alteração em código de produto é necessária para o envio; o card de diagnóstico e o `sendTestPush` já existem.
- Se o worker acusar erro de autenticação FCM ou token não registrado, a correção fica restrita ao worker/registro de token — sem tocar nos pedidos 1–3 (limite de 1500 caracteres, Google Agenda, aviso de agenda de fotos).

## Fora de escopo

- Não altera a central de notificações, nem a agenda, nem a publicação nos sites.
