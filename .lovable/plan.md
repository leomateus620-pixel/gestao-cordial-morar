# Criação na Cordial: registro completo, contador preservado, conferência rápida e alerta

Escopo: somente mudanças de código e uma migração aditiva. Não mexe em jobs existentes (incluindo 99ab2398), não altera dados e mantém intacta a regra anti-duplicidade (3 leituras de ausência, sem POST cego, duplicidade bloqueia) e `reference-lookup.ts`.

## O que foi confirmado no código (leitura de hoje)

- `logAttempt` (sync.server.ts ~210) grava `http_status`, `duration_ms`, categoria e mensagem, mas não um trecho da resposta.
- No `catch` do POST `/imovel/inserir` (~1272–1300): quando a falha é ambígua, o erro relançado é um novo `ImobiApiError` genérico — o `httpStatus`, a duração e o texto original se perdem. Quando não é ambígua (429, 4xx), só libera a trava e relança; `create_state='awaiting_create_reconcile'` e `create_absent_checks=0` gravados pelo `property_publication_prepare_create` ficam como estão.
- No tratamento final de erro (~1888–1943), os caminhos "sem posse" (`stillOwned=false`, `mappingOwned=false`, `LeaseLostError`) fazem `continue` antes de `logAttempt` — por isso tentativas somem, como a 2 e a 5 do job cd6511dd.
- A espera usa `backoffSeconds` (60 s × 2^n, teto 3600 s) também para jobs em conferência de criação.

## 1. Registro de toda tentativa

- Nova migração aditiva em `property_sync_attempts`: `response_excerpt text` (até 500 caracteres, sanitizado), `request_path text`, `outcome text` (`ok`, `failed`, `ambiguous`, `rate_limited`, `lease_lost`, `definitive_no_create`).
- `logAttempt` aceita `responseExcerpt`, `requestPath`, `outcome`; passa a não lançar erro se a gravação do log falhar (registra no console e segue), para o log não derrubar o job.
- No POST de criação: medir duração em volta do `imobiRequest` e gravar SEMPRE um registro antes de qualquer `throw` (sucesso, ambíguo, definitivo), com status HTTP e trecho do corpo vindo de `ImobiApiError` (novo campo `responseExcerpt` preenchido em `client.server.ts`, sanitizado por `sanitizeMessage`, sem tokens/cabeçalhos).
- O erro genérico relançado no caso ambíguo passa a carregar `httpStatus` e `cause` do erro original.
- Caminhos de perda de posse e de limite: gravar `logAttempt` com `outcome='lease_lost'` / `'rate_limited'` antes do `continue`. O log é só inserção; não altera job nem publicação, então é seguro mesmo sem posse.

## 2. Falha definitiva não zera o contador

- Nova função pura `classifyCreateFailure(error)` em `src/lib/imobibrasil/create-failure.ts`: `definitive` para 429 recebido antes do efeito, 400/401/403/404/409/422 com corpo de validação e erros locais antes do envio (pausa, catálogo); `ambiguous` para rede, timeout, 5xx, resposta sem ID.
- Migração: `property_publication_prepare_create` passa a guardar o estado anterior em novas colunas `create_state_before` e `create_absent_checks_before` (sem mudar o que já faz). Nova RPC `property_publication_revert_prepare_create(_job_id, _lease_token, _publication_id)`, SECURITY DEFINER, só `service_role`, que restaura estado e contador **somente** se o lease for válido e `create_ambiguous_at` ainda for o gravado pelo mesmo prepare.
- No `catch`: se `definitive`, chamar a RPC de reversão, liberar a trava e relançar. Se a reversão falhar, fica como hoje (conservador: continua aguardando conferência) e registra o motivo.
- Regra de segurança: nunca reverter em caso ambíguo; um 429 só conta como definitivo se veio do próprio site com status 429 (não de timeout).

## 3. Conferência rápida em `awaiting_create_reconcile`

- Nova função pura `reconcileDelaySeconds(absentChecks)` em `queue-policy.ts`: 60 s, 120 s, 180 s para as leituras 1, 2 e 3; depois disso volta ao comportamento atual.
- No reagendamento (~1892), se a publicação estiver em `awaiting_create_reconcile`, usar essa agenda em vez de `backoffSeconds`, e não consumir tentativa enquanto só estiver conferindo (como já acontece com limite).
- Continua respeitando `Retry-After` e o limitador por conta (4/s, 18/min).

## 4. Status na ficha e alerta de 20 minutos

- `getPropertySyncStatus` (`publish.functions.ts`) passa a expor `createState`, `createAbsentChecks` e `createAmbiguousAt`.
- `SiteSyncPanel.tsx`: rótulo "Aguardando confirmação da Cordial/Morar (conferência N de 3)".
- Alerta: no watchdog existente (`property-integration-watchdog`), se uma publicação estiver em `awaiting_create_reconcile` ou sem `external_property_id` há mais de 20 min desde o primeiro pedido de criação, inserir uma notificação para administradores (tabela `notifications`, uma única por publicação — chave de deduplicação). Na ficha, faixa vermelha "Ainda não está no ar na Cordial há X min".

## 5. Evidência para o chamado ImobiBrasil

- Consulta somente leitura (documentada em `docs/imobi-chamado-criacao-cordial.md`) cruzando `property_sync_attempts` e `property_provider_publications` para 1385, 1386, 1388 e 1390: horário, duração, status HTTP, trecho de resposta, referência enviada e horário de criação final.
- Aviso honesto: os casos antigos não têm status/corpo gravados; a evidência completa só vale para novas criações após a mudança. O texto do chamado terá horários, IDs Cordial e duração, sem tokens.

## Testes

- `create-failure.test.ts`: 429 do site e 422 = definitivo; timeout, 5xx, rede e resposta sem ID = ambíguo.
- `reconcile-schedule.test.ts`: 60/120/180 s nas três leituras; fora desse estado mantém backoff.
- Teste do fluxo (com simulador HTTP já existente): 429 no POST restaura contador anterior (ex.: 2 continua 2); 5xx mantém `awaiting_create_reconcile` com 0; nenhum segundo POST.
- Teste de log: lease perdido e limite gravam uma linha em `property_sync_attempts`; falha no insert do log não derruba o job.
- Fixture SQL (`tests/sql/`): reversão recusada com token errado, lease vencido ou prepare mais novo.
- `duplicate-guard.test.ts` e `reference-lookup.test.ts` continuam passando sem alteração.

## Arquivos afetados

- `src/lib/imobibrasil/sync.server.ts` (logAttempt, POST de criação, tratamento final de erro)
- `src/lib/imobibrasil/client.server.ts` e `errors.ts` (trecho da resposta, duração)
- `src/lib/imobibrasil/queue-policy.ts`, novo `create-failure.ts`
- `src/lib/imoveis/publish.functions.ts`, `src/components/imoveis/SiteSyncPanel.tsx`
- watchdog da integração (rota em `src/routes/api/public/hooks/`)
- Migração nova: colunas em `property_sync_attempts` e `property_provider_publications`, nova versão do `prepare_create`, RPC de reversão

## Riscos

- Classificar como definitivo algo que na verdade criou o anúncio geraria duplicidade: por isso só 429/4xx explícitos do site contam, e tudo mais continua ambíguo.
- Conferência a cada minuto aumenta leituras; ficam limitadas a 3 por criação e passam pelo limitador por conta.
- Trecho de resposta pode conter dados pessoais: limitado a 500 caracteres e sanitizado.
- Alterar `prepare_create` exige migração coordenada com o deploy do código.

## Perguntas em aberto

1. A reversão deve voltar ao contador anterior (ex.: 2) ou você prefere que uma falha definitiva conte como "leitura" adicional? O plano assume voltar ao anterior.
2. O alerta de 20 min vai só para administradores ou também para o corretor do imóvel?
3. Depois das 3 leituras rápidas, manter a espera crescente atual ou fixar em 10 min?
4. Ao implementar, posso publicar ou fica só na prévia para você revisar?
