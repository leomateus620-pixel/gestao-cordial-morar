# Push do Leonardo: diagnóstico + 2 notificações de teste

## O que a verificação mostrou

- Nenhum usuário do sistema tem token push registrado (`user_push_tokens` está vazia para os 7 perfis, inclusive Leonardo).
- A fila `push_outbox` tem 8 itens, todos com status `skipped` — ou seja, o worker rodou, mas não encontrou nenhum dispositivo para entregar.
- Conclusão: o envio não falhou no Firebase; ele nunca teve destinatário. Sem o token do celular do Leonardo, nenhum push pode sair.

Por que o token não foi criado no celular (causas prováveis, a confirmar no teste):
- O aviso só aparece quando a permissão do navegador está em "default"; se o card foi fechado/adiado, ele some por 7 dias e não volta.
- No celular, o registro só funciona em aba própria com HTTPS. Em iPhone/Safari, notificação web só existe se o site for adicionado à Tela de Início (PWA instalado).
- Hoje não há nenhuma tela que mostre ao usuário/admin se o dispositivo está registrado ou o motivo exato da falha.

## O que será feito

1. **Tela de diagnóstico de notificações** (Configurações → Notificações, visível ao usuário logado):
   - mostra permissão do navegador, se o push está configurado, se há service worker ativo, se o dispositivo atual está registrado e quantos dispositivos o usuário tem;
   - botão "Ativar neste dispositivo" que roda o fluxo existente e exibe o erro real quando falha (negado, iframe, não suportado, iOS sem PWA);
   - instrução curta para iPhone: adicionar à Tela de Início antes de ativar.

2. **Aviso mais persistente após login**: reexibir o card quando o usuário ainda não tem nenhum dispositivo registrado, mesmo depois do adiamento de 7 dias, com intervalo menor (24h). Sem mudar a central de notificações nem o sino.

3. **Botão de teste (somente admin)**: "Enviar push de teste para mim", que grava a notificação no pipeline atual (`notifications`) e dispara o worker — sem criar canal novo.

4. **Envio dos dois testes ao Leonardo**, assim que o token do celular dele existir:
   - "Teste 01"
   - "Foi vinculado um atendimento a você. Abrir?" com link para o atendimento.
   Depois confirmo pela fila (`push_outbox` com `sent`) e pelo retorno do FCM.

## Detalhes técnicos

- Sem mudança de schema: `user_push_tokens` e `push_outbox` já existem com RLS.
- Reuso de `enablePush()`/`disablePush()` em `src/lib/push/push-client.ts`; nenhuma reescrita do worker `api/public/hooks/push-worker`.
- O envio de teste passa por `notifications` + trigger de enfileiramento já existente, mantendo dedup por `dedup_key`.
- Nada dos pedidos anteriores (limite de 1500, Google Agenda, aviso de agenda de fotos) é alterado.

## O que preciso de você

Depois que eu implementar, abra **https://cordialgestao.com** no celular em aba própria (no iPhone, adicione à Tela de Início primeiro), entre como Leonardo e toque em "Ativar". Aí eu disparo os dois testes e confirmo a entrega.
