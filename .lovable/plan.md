## Por que eu não consigo "fazer o teste" sozinho

O fluxo OAuth do Google **exige interação humana real**: abrir o popup do Google, escolher a conta `leomateus620@gmail.com`, digitar senha, passar pelo 2FA se houver, e clicar em "Permitir" na tela de consentimento. Nada disso pode ser automatizado do meu lado — e mesmo que pudesse, eu precisaria das suas credenciais, o que não devo pedir nem armazenar.

O que eu **posso** fazer agora (quando você aprovar este plano e eu entrar em modo build) é validar tudo que **não** depende do clique humano:

### Validações automáticas que farei

1. **Secrets presentes no backend**
   - Conferir via `fetch_secrets` que `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` existem.

2. **Rota de callback viva**
   - `GET /api/public/google-calendar/callback` sem parâmetros deve redirecionar 303 para `/configuracoes?google=error&detail=missing_code`. Se vier 404/500, o roteamento está quebrado e eu corrijo antes de você testar.

3. **Geração da URL de consentimento**
   - Invocar o server function `startGoogleOAuth` autenticado como você e conferir que a URL retornada:
     - aponta para `accounts.google.com/o/oauth2/v2/auth`
     - tem `client_id` igual ao secret cadastrado
     - tem `redirect_uri` exatamente igual ao que você cadastrou no Google Cloud (preview ou produção, conforme o `origin` da requisição)
     - inclui escopo `calendar.events` + `openid email profile`
     - tem `access_type=offline` e `prompt=consent` (necessários pro `refresh_token` vir)

4. **Schema do banco**
   - Conferir que `google_calendar_connections`, colunas em `agenda_events` (`google_event_id`, `google_calendar_sync_status`, `google_synced_at`, `google_calendar_sync_error`) e `notifications` existem com RLS+GRANT corretos.

5. **Logs do callback**
   - Verificar se há tentativas anteriores suas no log com erro silencioso que ainda não apareceu na UI.

### O que **você** precisa fazer (2 min, é insubstituível)

Depois que eu confirmar os 5 pontos acima:

1. Garantir no Google Cloud Console:
   - **URIs de redirecionamento autorizados** contém **ambos**:
     - `https://gestao-cordial-morar.lovable.app/api/public/google-calendar/callback`
     - `https://id-preview--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/google-calendar/callback`
   - **OAuth consent screen → Test users**: `leomateus620@gmail.com` está listado.
2. No app, ir em **Configurações → Google Agenda → Conectar Google Agenda**.
3. Login com `leomateus620@gmail.com`, "Avançado → Acessar mesmo assim", marcar permissão de Calendar e clicar Permitir.
4. Volta pra `/configuracoes` com toast verde.
5. Criar um compromisso novo na Agenda → confirmar que aparece no Google Calendar dessa conta com lembrete.

### Se algo falhar

Você me manda **literalmente o texto do toast vermelho** (ou a URL com `?google=error&detail=...`) e eu corrijo cirurgicamente. Os erros mais comuns e a causa exata:

- `redirect_uri_mismatch` → falta uma das URIs no Google Cloud (passo 1).
- `access_denied` → e-mail não está na lista de test users (passo 1).
- `invalid_client` → secret errado no backend.
- `sem refresh_token` → já autorizou antes; revogue em https://myaccount.google.com/permissions e tente de novo.

### Nenhuma mudança de código neste plano

Apenas execução das 5 validações automáticas acima. Sem alterar arquivos, schema ou UI.
