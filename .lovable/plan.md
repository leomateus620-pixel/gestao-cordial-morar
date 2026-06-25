## Causa

O Google retorna `Erro 400: redirect_uri_mismatch` porque o app envia, no fluxo OAuth, o `redirect_uri`:

```
https://cordialgestao.com/api/public/google-calendar/callback
```

…mas no **Google Cloud Console** (OAuth Client ID usado pelas variáveis `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`) só estão registrados os domínios antigos (provavelmente `*.lovable.app` e/ou `www.cordialgestao.com`), não o domínio **raiz `cordialgestao.com`**.

O código está correto — ele calcula o `redirect_uri` a partir do `origin` da requisição (`getRedirectUri(origin)` em `src/lib/google-calendar/google.server.ts`) e usa o mesmo valor na troca do `code`. O Google só aceita se o URI estiver **idêntico** (esquema + host + path) à lista de "Authorized redirect URIs" do OAuth Client.

Como o usuário agora acessa o app pelo domínio customizado `cordialgestao.com`, qualquer host não cadastrado quebra o login.

## Correção (sem mudança de código)

No Google Cloud Console → APIs & Services → Credentials → o OAuth 2.0 Client ID em uso → **Authorized redirect URIs**, adicionar **todos** os domínios pelos quais o app é acessado hoje:

```
https://cordialgestao.com/api/public/google-calendar/callback
https://www.cordialgestao.com/api/public/google-calendar/callback
https://gestao-cordial-morar.lovable.app/api/public/google-calendar/callback
https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/google-calendar/callback
https://id-preview--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/google-calendar/callback
```

E em **Authorized JavaScript origins** os mesmos hosts sem o path:

```
https://cordialgestao.com
https://www.cordialgestao.com
https://gestao-cordial-morar.lovable.app
https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app
https://id-preview--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app
```

Salvar. A propagação no Google leva de alguns segundos a ~5 minutos. Depois disso o "Conectar Google Agenda" volta a funcionar em todos os domínios.

## Endurecimento opcional (mudança pequena de código)

Para evitar que o usuário fique preso quando entrar pelo apex (`cordialgestao.com`) sem ter cadastrado os dois hosts, podemos forçar o OAuth a sempre sair de `www.cordialgestao.com` (canônico). Faríamos um redirect 308 de `cordialgestao.com/api/public/google-calendar/*` para `www.cordialgestao.com/...` antes do `startGoogleOAuth`. Isso reduz a lista de URIs que precisa manter no Google.

Se você quiser, posso aplicar esse redirect canônico depois — mas o desbloqueio imediato é só atualizar a lista no Google Cloud Console acima.

## Como confirmar que está resolvido

1. Aplicar as URIs no Google Cloud Console e salvar.
2. Abrir `https://cordialgestao.com/agenda` → "Conectar Google Agenda".
3. Esperado: tela de consentimento normal do Google → volta para `/agenda?google=connected` com toast "Google Agenda conectada com sucesso".
