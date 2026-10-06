# Correção: conferência do Número antes da trava de criação

## O que muda para você
Quando o Número tiver mais de 15 caracteres e o anúncio ainda não existir, o sistema recusa na hora. Ele não consulta o site, não prende a criação por 3 minutos e não mexe na contagem de conferências. Para quem usa, nada muda: a mensagem de erro continua a mesma.

## Arquivos afetados
- `src/lib/imobibrasil/address-precheck.ts`: nova função `precheckCreateNumero(rawNumero)`, que normaliza o valor igual ao que vai no envio.
- `src/lib/imobibrasil/sync.server.ts`: a conferência sai do ramo de inserção e passa a rodar antes da trava. Corrige o comentário.
- `src/lib/imobibrasil/create-precheck-order.test.ts` (novo): prova a ordem e prova que o estado de criação fica intocado.
- `src/lib/imoveis/registration-numero.test.ts` (novo): salvamento no servidor com dublês.
- `package.json`: só os 2 testes novos entram no script `test`.

## Desenho

### 1. Conferência antes da trava (criação)
No `processJob`, dentro de `if (!externalId)`, logo no início, antes de `property_publication_acquire_create_lock` e de `lookupByReference`, o sistema roda `precheckCreateNumero(property.numero)`.
- O valor é o mesmo do corpo enviado: `textOrUndefined(property.numero)`, a mesma função que o serializer usa na linha 427. Para não ter duas regras, `textOrUndefined` será exportada do serializer, ou reaproveitada pelo mesmo módulo, sem mudar o que ela faz.
- Se bloquear, lança `ImobiApiError({ category: "validation", message })` com a mesma mensagem de hoje.
- Nesse momento ainda não há trava (`createLockWorker` é nulo), nem chamada HTTP, nem escrita na publicação.

Para não gravar nada antes, extraio uma função pura e injetável, `beginCreatePath(deps, { property, publication, job })`. Ela chama, nesta ordem:
1. a conferência do Número;
2. a trava (`deps.acquireLock`);
3. a consulta por referência (`deps.lookup`).

O `processJob` passa as funções reais. O resto do código continua igual, no mesmo lugar e na mesma ordem.

### 2. Conferência do ramo de inserção (linha 1269)
Fica só como defesa. Se algum dia ela disparar, libera a trava (`releaseCreateLock`) antes de lançar o erro.
- **Por que manter:** o `fullPayload` pode passar por ajustes depois da conferência inicial. Assim nenhum POST sai com número inválido e a trava nunca fica presa.
- Na prática ela não dispara, porque o mesmo valor já foi barrado antes.

### 3. Alteração (update)
Não muda. A conferência do patch mínimo (linha 1237) continua antes de `assertWriteAllowed` e de qualquer chamada HTTP. Só confirmo isso nos testes.

### 4. Comentário
O comentário passa a dizer:
- conferência inicial: "Antes da trava de criação e de qualquer HTTP: estado de criação intocado";
- conferência de defesa: "Defesa: libera a trava antes de lançar".

### O que o tratamento de erro genérico grava hoje (linhas ~1997–2040)
Erro de validação não é de nova tentativa, então `canRetry = false`. Com isso:

**No job (`finishJob`):**
- `status` = `failed`
- `attempts` = valor atual
- `next_run_at`, `finished_at`, `last_http_status` (nulo aqui), `last_error_category` = `validation`, `last_error_message`

**Na publicação:** `status` = `error`, `last_error_category` e `last_error_message`. O filtro é pela `publication_intent_revision`.

**Fica intocado:** `create_state`, `create_absent_checks`, `create_ambiguous_at`, `external_property_id` e a trava. O tratamento também registra a tentativa no histórico (`logAttempt`).

## Testes

### a. Servidor (dublês do banco, sem banco real)
- `createImovelCore` recusa Número com 16 caracteres.
- `finalizePropertyRegistration` recusa, por meio da validação central, antes de salvar.
- `updateImovelCore` recusa quando o Número mudou para mais de 15.
- `updateImovelCore` aceita a edição de outro campo quando o Número antigo, já acima de 15, não mudou.
- Se as funções centrais não aceitarem dublês como estão hoje, testo pela mesma regra que elas usam, a de `address-rules`, e pela ordem das chamadas, sem mudar o comportamento.

### b. Envio aos sites (`beginCreatePath`)
- Número acima de 15, sem ID do anúncio:
  - erro `validation`;
  - trava não chamada;
  - consulta ao site não chamada;
  - zero chamadas HTTP;
  - estado de criação idêntico ao de antes.
- Mesmo caso partindo de `awaiting_create_reconcile` com 3 conferências: resultado igual, e os campos `create_*` não mudam.
- Número com até 15 caracteres: a ordem segue igual (trava, consulta por referência, prosseguir).
- Defesa no ramo de inserção: se disparar, `releaseCreateLock` é chamado antes do erro.
- Alteração: a conferência do patch roda antes de `assertWriteAllowed`.

### c. Validação
- Suíte inteira: hoje são 494 testes passando, mais os novos.
- Typecheck limpo.

## Riscos e como evitar
- **Normalização diferente da do envio:** a conferência usa a mesma `textOrUndefined` do serializer.
- **Mudar sem querer o caminho de criação:** a extração só envolve as chamadas que já existem, na mesma ordem. O teste de até 15 caracteres garante o fluxo atual.
- **Anti-duplicidade:** nada muda na consulta por referência, no `awaiting_create_reconcile`, nas 3 conferências nem na classificação do HTTP 400.

## Restrições confirmadas
- Sem publicar o app.
- Sem tocar em NFS-e, no PR #29, em migrations ou em `supabase/`.
- Sem pausar a sincronização e sem mudar a lógica anti-duplicidade.
- Nenhuma alteração de dados e nenhum job enfileirado.
- Escopo limitado a `sync.server.ts`, `address-precheck.ts`, exportar `textOrUndefined` do serializer se preciso, os testes novos e o `package.json`.
