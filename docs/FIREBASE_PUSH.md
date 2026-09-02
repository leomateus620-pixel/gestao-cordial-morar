# Push (Firebase Cloud Messaging) — Gestão Cordial

Push é complementar ao sino in-app. Se os secrets abaixo não existirem, o sistema segue
funcionando normalmente e o servidor apenas registra `FCM não configurado`.

## Secrets a preencher em Project Settings → Secrets

Servidor (nunca commitar):

| Secret | Onde obter |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada (JSON inteiro, colado como valor) |

Client (públicos, prefixo `VITE_`):

| Secret | Onde obter (Firebase Console → Configurações do projeto → Seus apps → App Web) |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_VAPID_KEY` | Cloud Messaging → Web Push certificates → par de chaves (chave pública) |

Se o projeto Firebase ainda não existir: criar projeto, adicionar um app **Web**, ativar
Cloud Messaging e gerar o par de chaves Web Push.

## Como funciona

1. Após o login, o usuário ativa o push no sino → Preferências (pede permissão do browser).
2. O token vai para `public.user_push_tokens` (RLS: cada usuário só vê/edita os próprios).
3. Toda linha nova em `public.notifications` entra em `public.push_outbox` (trigger) e o
   worker `/api/public/hooks/push-worker` envia o push só para os tokens daquele `user_id`.
4. Token inválido (404/`UNREGISTERED`) é apagado. Falha de FCM não afeta o sino nem o e-mail.
   O dedup continua sendo o `dedup_key` de `notifications` (índice único), então não há push duplicado.
