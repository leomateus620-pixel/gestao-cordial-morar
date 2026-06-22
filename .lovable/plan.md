## Verificação da configuração Google OAuth + teste

### 1. Ajuste pendente no Google Cloud Console (você precisa fazer)

Você cadastrou **apenas 1 URI de redirecionamento** (preview). Falta o de produção. Sem ele, qualquer tentativa de conectar pelo domínio publicado vai falhar com `redirect_uri_mismatch`.

**Adicione em "URIs de redirecionamento autorizados":**

```
https://gestao-cordial-morar.lovable.app/api/public/google-calendar/callback
https://id-preview--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/google-calendar/callback
```

(o segundo você já tem — confirme que termina exatamente com `/api/public/google-calendar/callback`, a imagem corta no final)

As "Origens JavaScript autorizadas" já estão corretas.

### 2. Tela de consentimento OAuth

Como o app provavelmente está em modo **Testing**, o Google só deixa entrar e-mails listados como *test users*. Adicione `leomateus620@gmail.com` em:
**OAuth consent screen → Test users → + Add users**

Scopes mínimos que devem estar marcados:
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`
- `https://www.googleapis.com/auth/calendar.events`

### 3. Por que eu não consigo "testar com seu e-mail" sozinho

O fluxo OAuth do Google exige que **você** faça login na sua conta Google em um navegador real e clique em "Permitir". Não dá pra automatizar isso do meu lado sem suas credenciais — e pedir sua senha seria errado. O que eu **posso** validar, com sua autorização (modo build), é:

- Que os secrets `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` estão presentes no backend.
- Que a rota `/api/public/google-calendar/callback` responde (200/302/erro esperado).
- Que `startGoogleOAuth` gera uma URL de consentimento válida.
- Logar erros do callback de forma mais visível pra acelerar diagnóstico se o teste falhar.

### 4. Roteiro de teste que **você** executa (2 minutos)

1. Faça os ajustes 1 e 2 acima no Google Cloud.
2. No app (preview ou produção), vá em **Configurações → Google Agenda → Conectar Google Agenda**.
3. Faça login com `leomateus620@gmail.com` e aceite os escopos (vai aparecer aviso "App não verificado" → *Avançado → Acessar mesmo assim*).
4. Você deve voltar pra `/configuracoes` com toast verde "Google Agenda conectada".
5. Crie um compromisso novo na Agenda. Em segundos ele deve aparecer no Google Calendar dessa conta, com lembrete popup/e-mail conforme configurado.
6. Edite o compromisso → muda no Google. Cancele → some do Google.

Se algo falhar, me mande **a mensagem do toast vermelho** (vem do parâmetro `?google=error&detail=...`) ou o que aparecer no card do compromisso ("Falha"). Daí eu corrijo cirurgicamente.

### O que eu farei se você aprovar este plano

Apenas uma melhoria pequena de observabilidade no callback OAuth, sem mudar comportamento:

- `src/routes/api/public/google-calendar.callback.ts`: logar `console.error` com `stack` antes do redirect de erro, e propagar `detail` mais legível (ex.: `redirect_uri_mismatch`, `access_denied`, `invalid_client`).

Nada mais será alterado. Sem mudanças de schema, sem mudanças em outras telas.
