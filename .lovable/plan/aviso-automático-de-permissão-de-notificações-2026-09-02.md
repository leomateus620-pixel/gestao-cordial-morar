# Aviso automático de permissão de notificações

Hoje o push só é ativado se o usuário abrir o sino → Preferências → "Push no celular". A partir de agora, todo usuário logado deve receber automaticamente o convite para permitir notificações no navegador.

## Como vai funcionar

1. Ao entrar no sistema (logado), se o navegador ainda não tem permissão definida, aparece um aviso discreto — um card fixo no canto inferior direito:
   - Título curto: "Ative as notificações"
   - Uma linha: "Receba avisos de fotos, atendimentos e agenda no celular ou PC."
   - Botões: **Ativar** e **Agora não**.
2. "Ativar" chama o fluxo atual (`enablePush`): pede a permissão nativa do navegador, obtém o token FCM e grava em `user_push_tokens`. Sucesso → toast curto e o card some para sempre naquele dispositivo.
3. "Agora não" fecha e o aviso volta a aparecer só depois de 7 dias (por usuário + dispositivo), para não incomodar.
4. Casos especiais, sem travar ninguém:
   - Dentro do iframe do preview do Lovable o navegador ignora o pedido: o card explica "Abra o app em uma aba própria" com um botão que abre a aba.
   - Permissão já concedida: nada aparece (e o token continua sendo renovado no login, como já é hoje).
   - Permissão bloqueada pelo usuário no navegador: mostramos uma vez a orientação de reabilitar nas configurações do site e não insistimos.
   - Navegador sem suporte (ex.: alguns iOS antigos): nada aparece.
5. O sino in-app e o e-mail continuam funcionando igual para quem recusar.

## Detalhes técnicos

- Novo componente `src/components/notifications/PushPermissionPrompt.tsx`: card leve com tokens do design system, sem texto longo.
- Renderizado dentro do `NotificationExperienceProvider` (que já tem sessão e já chama `enablePush` silenciosamente quando a permissão é `granted`), aparecendo apenas quando há sessão e `Notification.permission === "default"`.
- Estado de adiamento em `localStorage` com chave por usuário (`gc.push.prompt-snooze:<userId>`), lido em `useEffect` (nunca no render/SSR).
- Reaproveita `isPushConfigured()`, `enablePush()` e os status já existentes (`registered`, `denied`, `open-in-new-tab`, `unsupported`, `not-configured`). Sem mudanças no worker, na migration, no service worker ou na central de notificações.
- Sem alterações nos pedidos 1–3 (limite de descrição, sync Google Agenda, aviso de agenda de fotos).

## Testes

- Usuário logado com permissão `default`: card aparece; "Ativar" grava token em `user_push_tokens`.
- "Agora não": card some e não reaparece na mesma sessão.
- Permissão já concedida ou bloqueada: card não insiste.
- Typecheck e app respondendo 200.
